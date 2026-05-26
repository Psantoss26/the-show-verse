import { NextResponse } from "next/server";
import { getValidTraktToken, setTraktCookies, traktFetch } from "@/lib/trakt/server";

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

function watchedKey(type, tmdbId) {
  return `${type}:${tmdbId}`;
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

function buildWatchedMap(items = [], mediaType) {
  const map = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const entity = mediaType === "movie" ? item?.movie : item?.show;
    const tmdbId = entity?.ids?.tmdb;
    if (!tmdbId) continue;

    map.set(watchedKey(mediaType, tmdbId), {
      plays: Number(item?.plays || 0),
      last_watched_at: item?.last_watched_at || null,
      collected_at: item?.collected_at || null,
    });
  }
  return map;
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

export async function GET(_request, { params }) {
  const { personId } = await params;

  if (!personId) {
    return noCache(
      NextResponse.json({ error: "Missing personId" }, { status: 400 }),
    );
  }

  const cookieStore = _request.cookies;
  const { token, refreshedTokens } = await getValidTraktToken(cookieStore);

  if (!token) {
    return noCache(NextResponse.json({ connected: false, items: [] }));
  }

  try {
    const [creditsRes, watchedMoviesRes, watchedShowsRes] = await Promise.allSettled([
      fetchTmdbPersonCredits(personId),
      traktFetch("/sync/watched/movies?extended=full", {
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

    const credits =
      creditsRes.status === "fulfilled" && creditsRes.value
        ? creditsRes.value
        : null;
    const moviesPayload =
      watchedMoviesRes.status === "fulfilled" && watchedMoviesRes.value?.ok
        ? watchedMoviesRes.value.json
        : [];
    const showsPayload =
      watchedShowsRes.status === "fulfilled" && watchedShowsRes.value?.ok
        ? watchedShowsRes.value.json
        : [];

    const watched = new Map([
      ...buildWatchedMap(moviesPayload, "movie"),
      ...buildWatchedMap(showsPayload, "tv"),
    ]);

    const items = dedupeCredits(credits?.cast || [], credits?.crew || [])
      .map((item) => {
        const meta = watched.get(watchedKey(item.media_type, item.id));
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

    const response = NextResponse.json({
      connected: true,
      items,
      stats: {
        total: items.length,
        movies: items.filter((item) => item.media_type === "movie").length,
        shows: items.filter((item) => item.media_type === "tv").length,
      },
    });

    if (refreshedTokens) setTraktCookies(response, refreshedTokens);
    return noCache(response);
  } catch (error) {
    const response = NextResponse.json(
      {
        connected: true,
        items: [],
        error: error?.message || "Trakt person watched failed",
      },
      { status: 200 },
    );
    if (refreshedTokens) setTraktCookies(response, refreshedTokens);
    return noCache(response);
  }
}
