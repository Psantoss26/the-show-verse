// /src/app/api/trakt/history/route.js
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  readTraktCookies,
  tokenIsExpired,
  refreshAccessToken,
  setTraktCookies,
  traktFetch,
} from "@/lib/trakt/server";
import { backendFetchJson, setBackendAuthCookies } from "@/lib/backend/server";
import { enrichMediaItemsWithTmdb } from "@/app/api/_utils/tmdbMetadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TMDB_KEY =
  process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";

function detailsHrefFor(type, tmdbId) {
  if (!tmdbId) return null;
  const mediaType = type === "movie" ? "movie" : "tv";
  return `/details/${mediaType}/${tmdbId}`;
}

function ymdToIsoStart(ymd) {
  if (!ymd) return null;
  return `${ymd}T00:00:00.000Z`;
}
function ymdToIsoEnd(ymd) {
  if (!ymd) return null;
  return `${ymd}T23:59:59.999Z`;
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchTmdbLocalized({ type, tmdbId }) {
  if (!TMDB_KEY || !tmdbId) return null;
  const endpoint = type === "movie" ? "movie" : "tv";
  const url = `${TMDB_BASE}/${endpoint}/${encodeURIComponent(tmdbId)}?api_key=${encodeURIComponent(
    TMDB_KEY,
  )}&language=es-ES`;

  const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 } });
  if (!res.ok) return null;
  const j = await safeJson(res);
  if (!j) return null;

  const title = type === "movie" ? j?.title : j?.name;
  const poster_path = j?.poster_path || null;
  const date = type === "movie" ? j?.release_date : j?.first_air_date;
  const year = date ? String(date).slice(0, 4) : null;

  return { title, poster_path, year };
}

async function mapLimit(arr, limit, fn) {
  const out = new Array(arr.length);
  let i = 0;
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (i < arr.length) {
      const idx = i++;
      out[idx] = await fn(arr[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function GET(request) {
  const type = request.nextUrl.searchParams.get("type") || "all"; // all|movies|shows
  const from = request.nextUrl.searchParams.get("from") || null;
  const to = request.nextUrl.searchParams.get("to") || null;
  const page = Math.max(
    1,
    Number(request.nextUrl.searchParams.get("page") || 1),
  );
  const limitRaw = request.nextUrl.searchParams.get("limit") || "all";
  const extended = request.nextUrl.searchParams.get("extended") || "full";
  const enrichRaw = request.nextUrl.searchParams.get("enrich");
  const enrich =
    enrichRaw == null ||
    !["0", "false", "minimal", "none"].includes(
      String(enrichRaw).toLowerCase(),
    );

  const numericLimit = Number(limitRaw);
  const hasNumericLimit = Number.isFinite(numericLimit) && numericLimit > 0;
  const fetchAll = !hasNumericLimit || String(limitRaw).toLowerCase() === "all";
  const perPage = hasNumericLimit
    ? Math.max(1, Math.min(200, numericLimit))
    : 200;
  const targetCount = hasNumericLimit ? Math.floor(numericLimit) : null;

  try {
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    qs.set("limit", String(perPage));
    if (type === "movies") qs.set("type", "movie");
    if (type === "shows") qs.set("type", "tv");
    if (from) qs.set("from", ymdToIsoStart(from));
    if (to) qs.set("to", ymdToIsoEnd(to));

    const backend = await backendFetchJson(request, `/v1/history?${qs.toString()}`);
    if (backend.ok) {
      const rows = Array.isArray(backend.json?.results) ? backend.json.results : [];
      const normalized = rows.map((item) => {
        const itemType = item.mediaType === "movie" ? "movie" : "show";
        return {
          id: item.id,
          watched_at: item.watchedAt,
          type: itemType,
          tmdbId: item.tmdbId,
          title: item.title || null,
          title_es: item.title || null,
          poster_path: item.posterPath || null,
          year: null,
          detailsHref: detailsHrefFor(itemType, item.tmdbId),
          ...(item.mediaType === "tv" && item.season && item.episode
            ? {
                episode: {
                  season: item.season,
                  number: item.episode,
                  title: null,
                },
                season: item.season,
                number: item.episode,
                episodeTitle: null,
              }
            : {}),
        };
      });
      const enriched = await enrichMediaItemsWithTmdb(normalized, {
        getId: (item) => item.tmdbId,
        getType: (item) => item.type,
      });

      const plays = enriched.length;
      const uniques = new Set(enriched.map((x) => `${x.type}:${x.tmdbId}`)).size;
      const movies = enriched.filter((x) => x.type === "movie").length;
      const shows = enriched.filter((x) => x.type === "show").length;

      const res = NextResponse.json({
        connected: true,
        items: enriched,
        stats: { plays, uniques, movies, shows },
        pagination: {
          page,
          limit: perPage,
          returned: enriched.length,
          hasMore: enriched.length >= perPage,
        },
        source: "backend",
      });
      setBackendAuthCookies(res, backend, { secure: request.nextUrl.protocol === "https:" });
      return res;
    }
    if (!backend.skipped && backend.status !== 401) {
      console.warn("Backend history failed; falling back to Trakt", backend.error);
    }
  } catch (e) {
    console.warn("Backend history failed; falling back to Trakt", e);
  }

  // ✅ FIX: cookies() es Promise en tu Next
  const cookieStore = await cookies();
  const { accessToken, refreshToken, expiresAtMs } =
    readTraktCookies(cookieStore);

  if (!accessToken && !refreshToken) {
    return NextResponse.json({ connected: false, items: [], stats: null });
  }

  let token = accessToken;
  let refreshedTokens = null;

  try {
    if (!token || tokenIsExpired(expiresAtMs)) {
      if (!refreshToken)
        return NextResponse.json({ connected: false, items: [], stats: null });
      refreshedTokens = await refreshAccessToken(refreshToken);
      token = refreshedTokens.access_token;
    }

    const buildPath = (p, l) => {
      const qs = new URLSearchParams();
      qs.set("page", String(p));
      qs.set("limit", String(l));
      qs.set("extended", extended);
      if (from) qs.set("start_at", ymdToIsoStart(from));
      if (to) qs.set("end_at", ymdToIsoEnd(to));

      return type === "all"
        ? `/sync/history?${qs.toString()}`
        : `/sync/history/${encodeURIComponent(type)}?${qs.toString()}`;
    };

    const raw = [];
    let currentPage = page;
    const maxPages = 100;
    let lastPageSize = 0;

    while (currentPage < page + maxPages) {
      const path = buildPath(currentPage, perPage);
      const r = await traktFetch(path, { token });
      if (!r.ok) {
        const error = new Error(
          r?.json?.error || `Trakt history failed (${r.status})`,
        );
        error.status = r.status;
        throw error;
      }

      const pageItems = Array.isArray(r.json) ? r.json : [];
      lastPageSize = pageItems.length;
      raw.push(...pageItems);

      // Si es modo paginado clásico, una sola petición (siempre que no pidan > perPage)
      if (!fetchAll && (targetCount == null || targetCount <= perPage)) break;

      // Si pidieron un límite numérico mayor a perPage, continuar hasta cubrirlo
      if (!fetchAll && targetCount != null && raw.length >= targetCount) {
        raw.length = targetCount;
        break;
      }

      // En modo all o multi-page, parar cuando no haya más resultados
      if (pageItems.length < perPage) break;

      currentPage += 1;
    }

    // ✅ Normaliza e INCLUYE info de episodio (season/number)
    const normalized = raw
      .map((h) => {
        const id = h?.id ?? null;
        const watched_at = h?.watched_at ?? null;

        // MOVIE
        if (h?.movie) {
          const obj = h.movie;
          const tmdbId = obj?.ids?.tmdb ?? null;
          return {
            id,
            watched_at,
            type: "movie",
            tmdbId,
            title: obj?.title ?? null,
            year: obj?.year ?? null,
            detailsHref: detailsHrefFor("movie", tmdbId),
          };
        }

        // EPISODE => lo devolvemos como type:'show' + episode meta
        if (h?.show && h?.episode) {
          const show = h.show;
          const ep = h.episode;
          const tmdbId = show?.ids?.tmdb ?? null;

          const season = ep?.season ?? null;
          const number = ep?.number ?? null;
          const episodeTitle = ep?.title ?? null;

          return {
            id,
            watched_at,
            type: "show",
            tmdbId,
            title: show?.title ?? null,
            year: show?.year ?? null,

            // ✅ lo que tu HistoryClient lee con getEpisodeMeta()
            episode: { season, number, title: episodeTitle },
            season,
            number,
            episodeTitle,
            detailsHref: detailsHrefFor("show", tmdbId),
          };
        }

        // SHOW (por si llega así)
        if (h?.show) {
          const obj = h.show;
          const tmdbId = obj?.ids?.tmdb ?? null;
          return {
            id,
            watched_at,
            type: "show",
            tmdbId,
            title: obj?.title ?? null,
            year: obj?.year ?? null,
            detailsHref: detailsHrefFor("show", tmdbId),
          };
        }

        return null;
      })
      .filter(Boolean)
      .filter((x) => x.id && x.watched_at && x.type && x.tmdbId);

    // En modo progresivo, no bloqueamos la respuesta enriqueciendo cada item
    // contra TMDb. El cliente carga posters bajo demanda cuando entran en vista.
    const enriched = enrich
      ? await mapLimit(normalized, 10, async (item) => {
          const tmdbType = item.type === "movie" ? "movie" : "show";
          const tmdb = await fetchTmdbLocalized({
            type: tmdbType,
            tmdbId: item.tmdbId,
          }).catch(() => null);

          return {
            ...item,
            title_es: tmdb?.title || null,
            poster_path: tmdb?.poster_path || null,
            year: tmdb?.year || item.year || null,
            detailsHref: detailsHrefFor(item.type, item.tmdbId),
          };
        })
      : normalized;

    const plays = enriched.length;
    const uniques = new Set(enriched.map((x) => `${x.type}:${x.tmdbId}`)).size;
    const movies = enriched.filter((x) => x.type === "movie").length;
    const shows = enriched.filter((x) => x.type === "show").length;

    const res = NextResponse.json({
      connected: true,
      items: enriched,
      stats: { plays, uniques, movies, shows },
      pagination: {
        page,
        limit: perPage,
        returned: enriched.length,
        hasMore: !fetchAll && lastPageSize >= perPage,
      },
    });

    if (refreshedTokens) setTraktCookies(res, refreshedTokens);
    return res;
  } catch (e) {
    const status = Number(e?.status || 500);
    const res = NextResponse.json(
      {
        connected: false,
        upstreamStatus: status,
        error: "Trakt no está disponible ahora mismo.",
        items: [],
        stats: null,
      },
      { status },
    );
    if (refreshedTokens) setTraktCookies(res, refreshedTokens);
    return res;
  }
}
