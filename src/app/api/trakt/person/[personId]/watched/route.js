import { NextResponse } from "next/server";
import { getValidTraktToken, setTraktCookies, traktFetch } from "@/lib/trakt/server";
import {
  backendFetchJson,
  setBackendAuthCookies,
} from "@/lib/backend/server";
import {
  buildBackendWatchedMap,
  buildTraktWatchedMap,
  watchedKey,
} from "@/lib/actor/watchedCredits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const TMDB_API_KEY =
  process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";

function noCache(response) {
  response.headers.set(
    "Cache-Control",
    "private, no-store, no-cache, must-revalidate, max-age=0",
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function yearFromDate(value) {
  const year = value ? String(value).slice(0, 4) : "";
  return /^\d{4}$/.test(year) ? Number(year) : null;
}

function normalizeCredit(credit, kind) {
  if (!credit?.id) return null;

  const mediaType = credit.media_type || (credit.first_air_date ? "tv" : "movie");
  if (mediaType !== "movie" && mediaType !== "tv") return null;

  const date = mediaType === "tv" ? credit.first_air_date : credit.release_date;
  const roleText =
    kind === "acting"
      ? credit.character
        ? `como ${credit.character}`
        : ""
      : credit.job || "Dirección";

  return {
    id: credit.id,
    media_type: mediaType,
    title: credit.title || credit.name || "",
    name: credit.name || credit.title || "",
    poster_path: credit.poster_path || null,
    backdrop_path: credit.backdrop_path || null,
    release_date: credit.release_date || null,
    first_air_date: credit.first_air_date || null,
    date,
    year: yearFromDate(date),
    vote_average: credit.vote_average || null,
    vote_count: credit.vote_count || null,
    popularity: credit.popularity || 0,
    order: credit.order ?? null,
    episode_count: credit.episode_count || null,
    kind,
    department: kind === "acting" ? "Acting" : credit.department || "Directing",
    job: credit.job || null,
    character: credit.character || null,
    subtitle: roleText,
  };
}

function creditKey(item) {
  return `${item?.media_type || "movie"}:${item?.id}`;
}

function mergeText(a, b) {
  const parts = [a, b]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return Array.from(new Set(parts)).join(" · ");
}

function dedupeCredits(cast = [], crew = []) {
  const byKey = new Map();
  const relevantCrew = crew.filter((credit) => {
    const department = String(credit?.department || "").toLowerCase();
    const job = String(credit?.job || "").toLowerCase();
    return department === "directing" || /\bdirector\b/.test(job);
  });

  [...cast.map((c) => normalizeCredit(c, "acting")), ...relevantCrew.map((c) => normalizeCredit(c, "crew"))]
    .filter(Boolean)
    .forEach((item) => {
      const key = creditKey(item);
      const current = byKey.get(key);
      if (!current) {
        byKey.set(key, item);
        return;
      }

      byKey.set(key, {
        ...current,
        poster_path: current.poster_path || item.poster_path,
        backdrop_path: current.backdrop_path || item.backdrop_path,
        vote_average: current.vote_average || item.vote_average,
        vote_count: current.vote_count || item.vote_count,
        popularity: Math.max(Number(current.popularity || 0), Number(item.popularity || 0)),
        subtitle: mergeText(current.subtitle, item.subtitle),
        kind: current.kind === "acting" && item.kind === "crew" ? "acting" : current.kind,
      });
    });

  return Array.from(byKey.values());
}

async function fetchTmdbPersonCredits(personId) {
  if (!TMDB_API_KEY || !personId) return null;

  const qs = new URLSearchParams({
    api_key: TMDB_API_KEY,
    language: "es-ES",
  });
  const res = await fetch(
    `${TMDB_BASE}/person/${encodeURIComponent(personId)}/combined_credits?${qs.toString()}`,
    { next: { revalidate: 60 * 60 * 24 } },
  );
  if (!res.ok) return null;
  return safeJson(res);
}

const BACKEND_HISTORY_PAGE_SIZE = 2000;
const BACKEND_HISTORY_MAX_PAGES = 100;

async function fetchBackendWatched(request) {
  const rows = [];
  let lastBackend = null;

  for (let page = 1; page <= BACKEND_HISTORY_MAX_PAGES; page += 1) {
    const query = new URLSearchParams({
      page: String(page),
      limit: String(BACKEND_HISTORY_PAGE_SIZE),
    });
    const backend = await backendFetchJson(
      request,
      `/v1/history?${query.toString()}`,
    );

    if (!backend.ok || !Array.isArray(backend.json?.results)) {
      return { available: false, backend };
    }

    lastBackend = backend;
    rows.push(...backend.json.results);
    if (backend.json.results.length < BACKEND_HISTORY_PAGE_SIZE) break;
  }

  return {
    available: true,
    backend: lastBackend,
    watched: buildBackendWatchedMap(rows),
  };
}

function selectWatchedCredits(credits, watched) {
  return dedupeCredits(credits?.cast || [], credits?.crew || [])
    .map((item) => {
      const key = watchedKey(item.media_type, item.id);
      const meta = key ? watched.get(key) : null;
      if (!meta) return null;
      return {
        ...item,
        watchedPlays: meta.plays,
        lastWatchedAt: meta.last_watched_at,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const dateA = new Date(a.lastWatchedAt || 0).getTime();
      const dateB = new Date(b.lastWatchedAt || 0).getTime();
      if (dateA !== dateB) return dateB - dateA;
      return Number(b.popularity || 0) - Number(a.popularity || 0);
    });
}

function watchedResponse(items, source) {
  return NextResponse.json({
    connected: true,
    items,
    source,
    stats: {
      total: items.length,
      movies: items.filter((item) => item.media_type === "movie").length,
      shows: items.filter((item) => item.media_type === "tv").length,
    },
  });
}

export async function GET(_request, { params }) {
  const { personId } = await params;
  let refreshedTraktTokens = null;

  if (!personId) {
    return noCache(
      NextResponse.json({ error: "Missing personId" }, { status: 400 }),
    );
  }

  try {
    const [creditsResult, backendResult] = await Promise.allSettled([
      fetchTmdbPersonCredits(personId),
      fetchBackendWatched(_request),
    ]);
    const credits =
      creditsResult.status === "fulfilled" ? creditsResult.value : null;
    const backendWatched =
      backendResult.status === "fulfilled" ? backendResult.value : null;

    // PostgreSQL es la fuente de verdad del historial. Una cuenta iniciada no
    // debe necesitar una conexión activa con Trakt para ver esta sección.
    if (backendWatched?.available) {
      const response = watchedResponse(
        selectWatchedCredits(credits, backendWatched.watched),
        "backend",
      );
      setBackendAuthCookies(response, backendWatched.backend, {
        secure: _request.nextUrl.protocol === "https:",
      });
      return noCache(response);
    }

    const cookieStore = _request.cookies;
    const { token, refreshedTokens } = await getValidTraktToken(cookieStore);
    refreshedTraktTokens = refreshedTokens;
    if (!token) {
      return noCache(
        NextResponse.json({ connected: false, items: [], source: "none" }),
      );
    }

    // Solo hace falta `movie.ids.tmdb`/`show.ids.tmdb` (ver
    // `buildTraktWatchedMap`),
    // que YA viene en la respuesta mínima de Trakt. Pedir `extended=full` en
    // movies traía metadatos completos por cada película vista (potencialmente
    // miles, en un historial largo) que se descartaban al instante: más peso,
    // más tiempo de respuesta y más riesgo de agotar el timeout de 9s en
    // cuentas con mucho historial -- justo cuando eso pasa, `Promise.allSettled`
    // descarta esa rama silenciosamente y la sección de "Vistos" se queda vacía
    // sin ningún aviso.
    const [watchedMoviesRes, watchedShowsRes] = await Promise.allSettled([
      traktFetch("/sync/watched/movies", {
        token,
        timeoutMs: 9000,
        retries: 1,
      }),
      traktFetch("/sync/watched/shows?extended=noseasons", {
        token,
        timeoutMs: 9000,
        retries: 1,
      }),
    ]);

    const moviesPayload =
      watchedMoviesRes.status === "fulfilled" && watchedMoviesRes.value?.ok
        ? watchedMoviesRes.value.json
        : [];
    const showsPayload =
      watchedShowsRes.status === "fulfilled" && watchedShowsRes.value?.ok
        ? watchedShowsRes.value.json
        : [];

    // `Promise.allSettled` traga los fallos de cada rama sin dejar rastro: la
    // sección quedaba vacía en silencio, indistinguible de "sin coincidencias".
    // Se registran aquí para poder diagnosticar (timeout, 401 tras refresco,
    // TMDB caído...) la próxima vez que ocurra en vez de solo ver "0 items".
    if (!credits) {
      console.error(
        `[trakt/person/watched] TMDB combined_credits falló para person ${personId}:`,
        creditsResult.status === "rejected"
          ? creditsResult.reason
          : "respuesta vacía",
      );
    }
    if (
      watchedMoviesRes.status === "rejected" ||
      !watchedMoviesRes.value?.ok
    ) {
      console.error(
        `[trakt/person/watched] Trakt watched/movies falló para person ${personId}:`,
        watchedMoviesRes.status === "rejected"
          ? watchedMoviesRes.reason
          : `HTTP ${watchedMoviesRes.value?.status}`,
      );
    }
    if (watchedShowsRes.status === "rejected" || !watchedShowsRes.value?.ok) {
      console.error(
        `[trakt/person/watched] Trakt watched/shows falló para person ${personId}:`,
        watchedShowsRes.status === "rejected"
          ? watchedShowsRes.reason
          : `HTTP ${watchedShowsRes.value?.status}`,
      );
    }

    const watched = new Map([
      ...buildTraktWatchedMap(moviesPayload, "movie"),
      ...buildTraktWatchedMap(showsPayload, "tv"),
    ]);

    const response = watchedResponse(
      selectWatchedCredits(credits, watched),
      "trakt",
    );

    if (refreshedTraktTokens) {
      setTraktCookies(response, refreshedTraktTokens);
    }
    return noCache(response);
  } catch (error) {
    console.error(
      `[trakt/person/watched] Fallo inesperado para person ${personId}:`,
      error,
    );
    const response = NextResponse.json(
      {
        connected: true,
        items: [],
        error: error?.message || "Trakt person watched failed",
      },
      { status: 200 },
    );
    if (refreshedTraktTokens) {
      setTraktCookies(response, refreshedTraktTokens);
    }
    return noCache(response);
  }
}
