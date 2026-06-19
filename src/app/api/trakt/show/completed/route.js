// /src/app/api/trakt/show/completed/route.js
// Devuelve las series que el usuario ha completado (todos los episodios vistos)
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  readTraktCookies,
  tokenIsExpired,
  refreshAccessToken,
  setTraktCookies,
  traktFetch,
} from "@/lib/trakt/server";
import { backendFetchJson, setBackendAuthCookies, hasBackendCredentials } from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

const TMDB_KEY =
  process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";

// ---------------------------------------------------------------------------
// Caché en memoria del lado servidor (misma instancia Node).
// ---------------------------------------------------------------------------
const _completedCache = new Map();
const CACHE_TTL_MS = 3 * 60 * 1000;

function _getCacheKey(token) {
  return typeof token === "string" && token.length > 0
    ? token.slice(0, 24)
    : null;
}

function _readCache(key) {
  if (!key) return null;
  const entry = _completedCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    _completedCache.delete(key);
    return null;
  }
  return entry.data;
}

function _writeCache(key, data) {
  if (!key) return;
  if (_completedCache.size >= 200) {
    _completedCache.delete(_completedCache.keys().next().value);
  }
  _completedCache.set(key, { ts: Date.now(), data });
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchTmdbShow(tmdbId) {
  if (!TMDB_KEY || !tmdbId) return null;
  const url = `${TMDB_BASE}/tv/${encodeURIComponent(tmdbId)}?api_key=${encodeURIComponent(TMDB_KEY)}&language=es-ES`;
  const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 } });
  if (!res.ok) return null;
  const j = await safeJson(res);
  if (!j) return null;
  return {
    name: j?.name || null,
    poster_path: j?.poster_path || null,
    backdrop_path: j?.backdrop_path || null,
    first_air_date: j?.first_air_date || null,
    vote_average: j?.vote_average || null,
    overview: j?.overview || null,
    number_of_seasons: j?.number_of_seasons || null,
    number_of_episodes: j?.number_of_episodes || null,
    genres: (j?.genres || []).map((g) => g.name),
    status: j?.status || null,
    networks: (j?.networks || []).map((n) => ({
      name: n.name,
      logo_path: n.logo_path,
    })),
    seasons: j?.seasons || [],
  };
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
  if (hasBackendCredentials(request)) {
    try {
      const backend = await backendFetchJson(request, "/v1/stats/shows/completed");
      if (backend.ok) {
        const results = Array.isArray(backend.json?.results) ? backend.json.results : [];
        
        // 1.5 Fetch user ratings from backend in parallel if needed
        let ratingsRes = await backendFetchJson(request, "/v1/ratings").catch(() => null);
        const userRatingsMap = new Map();
        if (ratingsRes?.ok && Array.isArray(ratingsRes.json?.results)) {
          for (const ratingItem of ratingsRes.json.results) {
            if (ratingItem.mediaType === "tv" && ratingItem.tmdbId && ratingItem.rating != null) {
              userRatingsMap.set(Number(ratingItem.tmdbId), ratingItem.rating);
            }
          }
        }

        const enriched = await mapLimit(results, 8, async (item) => {
          const tmdbId = item.tmdbId;
          const tmdb = await fetchTmdbShow(tmdbId).catch(() => null);
          const historyRes = await backendFetchJson(request, `/v1/history/shows/${tmdbId}`).catch(() => null);
          const episodes = Array.isArray(historyRes?.json?.episodes)
            ? historyRes.json.episodes
            : [];

          const seasonMap = {};
          if (tmdb?.seasons) {
            for (const s of tmdb.seasons) {
              if (s.season_number > 0) {
                seasonMap[s.season_number] = s.episode_count;
              }
            }
          }

          const aired = tmdb?.number_of_episodes || 0;

          const watchedKeys = new Set();
          for (const ep of episodes) {
            if (ep.season != null && ep.episode != null) {
              watchedKeys.add(`${ep.season}-${ep.episode}`);
            }
          }
          const completed = watchedKeys.size;
          const pct = 100; // it's completed

          const lastEp = episodes[0];
          const lastEpisode = lastEp
            ? {
                season: lastEp.season,
                number: lastEp.episode,
                title: null,
              }
            : null;

          const userRating = userRatingsMap.get(Number(tmdbId)) || null;

          return {
            traktId: null,
            tmdbId,
            title: item.title || tmdb?.name || "Sin título",
            title_es: tmdb?.name || item.title || null,
            year: tmdb?.first_air_date ? String(tmdb.first_air_date).slice(0, 4) : null,
            aired,
            completed,
            pct,
            nextEpisode: null,
            lastEpisode,
            lastWatchedAt: item.lastWatchedAt || lastEp?.watchedAt || null,
            user_rating: userRating,
            poster_path: item.posterPath || tmdb?.poster_path || null,
            backdrop_path: tmdb?.backdrop_path || null,
            first_air_date: tmdb?.first_air_date || null,
            vote_average: tmdb?.vote_average || null,
            overview: tmdb?.overview || null,
            number_of_seasons: tmdb?.number_of_seasons || null,
            total_episodes: tmdb?.number_of_episodes || null,
            genres: tmdb?.genres || [],
            tmdb_status: tmdb?.status || null,
            networks: tmdb?.networks || [],
            detailsHref: `/details/tv/${tmdbId}`,
          };
        });

        // Filter out shows that are not fully completed (or not completed in backend database)
        const completedShows = enriched.filter(item => item.completed > 0 && item.completed >= item.aired);

        const responseData = {
          connected: true,
          items: completedShows,
          stats: {
            total: completedShows.length,
            avgProgress: 100,
            totalEpisodesWatched: completedShows.reduce((s, x) => s + x.completed, 0),
            totalEpisodesRemaining: 0,
          },
          source: "backend"
        };
        const res = NextResponse.json(responseData);
        setBackendAuthCookies(res, backend, { secure: request.nextUrl.protocol === "https:" });
        return res;
      }
    } catch (e) {
      console.error("Failed to load completed from backend", e);
    }
  }

  const cookieStore = await cookies();
  const { accessToken, refreshToken, expiresAtMs } =
    readTraktCookies(cookieStore);

  if (!accessToken && !refreshToken) {
    return NextResponse.json({ connected: false, items: [] });
  }

  let token = accessToken;
  let refreshedTokens = null;

  try {
    if (!token || tokenIsExpired(expiresAtMs)) {
      if (!refreshToken)
        return NextResponse.json({ connected: false, items: [] });
      refreshedTokens = await refreshAccessToken(refreshToken);
      token = refreshedTokens.access_token;
    }

    // Comprobar caché servidor
    const cacheKey = _getCacheKey(token);
    const cachedData = _readCache(cacheKey);
    if (cachedData) {
      const res = NextResponse.json(cachedData);
      if (refreshedTokens) setTraktCookies(res, refreshedTokens);
      return res;
    }

    // 1. Obtener todas las series vistas por el usuario
    const watchedRes = await traktFetch(
      "/sync/watched/shows?extended=noseasons",
      { token },
    );
    if (!watchedRes.ok)
      throw new Error(`Trakt watched shows failed (${watchedRes.status})`);

    const watchedShows = Array.isArray(watchedRes.json) ? watchedRes.json : [];

    // 1.5. Obtener ratings del usuario para todas las series
    let userRatingsMap = new Map();
    try {
      let page = 1;
      const limit = 100;
      while (page <= 20) {
        const ratingsRes = await traktFetch(
          `/sync/ratings/shows?extended=full&page=${page}&limit=${limit}`,
          { token },
        );
        if (!ratingsRes.ok) break;

        const ratings = ratingsRes.json;
        if (!Array.isArray(ratings) || ratings.length === 0) break;

        for (const ratingItem of ratings) {
          const traktId = ratingItem?.show?.ids?.trakt;
          const rating = ratingItem?.rating;
          if (traktId && typeof rating === "number") {
            userRatingsMap.set(Number(traktId), rating);
          }
        }

        page++;
      }
    } catch (err) {
      console.warn("Failed to fetch user ratings:", err);
    }

    // 2. Para cada serie, obtener el progreso detallado
    const progressResults = await mapLimit(watchedShows, 6, async (item) => {
      const show = item?.show;
      const traktId = show?.ids?.trakt;
      const tmdbId = show?.ids?.tmdb;
      if (!traktId || !tmdbId) return null;

      try {
        const progressRes = await traktFetch(
          `/shows/${encodeURIComponent(traktId)}/progress/watched?hidden=false&specials=false&count_specials=false`,
          { token },
        );
        if (!progressRes.ok) return null;

        const progress = progressRes.json;
        const aired = progress?.aired || 0;
        const completed = progress?.completed || 0;

        // Solo series completadas (todos los episodios emitidos vistos)
        if (completed <= 0 || completed < aired) return null;

        const pct = 100;

        // Info del último episodio visto
        const lastEp = progress?.last_episode || null;
        const lastWatchedAt =
          progress?.last_watched_at || item?.last_watched_at || null;
        const userRating = userRatingsMap.get(Number(traktId)) || null;

        return {
          traktId,
          tmdbId,
          title: show?.title || "Sin título",
          year: show?.year || null,
          aired,
          completed,
          pct,
          nextEpisode: null,
          lastEpisode: lastEp
            ? {
                season: lastEp.season,
                number: lastEp.number,
                title: lastEp.title || null,
              }
            : null,
          lastWatchedAt,
          user_rating: userRating,
        };
      } catch {
        return null;
      }
    });

    const completedShows = progressResults.filter(Boolean);

    // Ordenar por último visto (más reciente primero)
    completedShows.sort((a, b) => {
      const ta = new Date(a.lastWatchedAt || 0).getTime();
      const tb = new Date(b.lastWatchedAt || 0).getTime();
      return tb - ta;
    });

    // 3. Enriquecer con datos de TMDb
    const enriched = await mapLimit(completedShows, 8, async (item) => {
      const tmdb = await fetchTmdbShow(item.tmdbId).catch(() => null);
      return {
        ...item,
        title_es: tmdb?.name || null,
        poster_path: tmdb?.poster_path || null,
        backdrop_path: tmdb?.backdrop_path || null,
        first_air_date: tmdb?.first_air_date || null,
        vote_average: tmdb?.vote_average || null,
        overview: tmdb?.overview || null,
        number_of_seasons: tmdb?.number_of_seasons || null,
        total_episodes: tmdb?.number_of_episodes || null,
        genres: tmdb?.genres || [],
        tmdb_status: tmdb?.status || null,
        networks: tmdb?.networks || [],
        detailsHref: `/details/tv/${item.tmdbId}`,
      };
    });

    const responseData = {
      connected: true,
      items: enriched,
      stats: {
        total: enriched.length,
        avgProgress: 100,
        totalEpisodesWatched: enriched.reduce((s, x) => s + x.completed, 0),
        totalEpisodesRemaining: 0,
      },
    };

    _writeCache(cacheKey, responseData);

    const res = NextResponse.json(responseData);
    if (refreshedTokens) setTraktCookies(res, refreshedTokens);
    return res;
  } catch (e) {
    const res = NextResponse.json(
      {
        connected: true,
        error: e?.message || "Error cargando series completadas",
        items: [],
      },
      { status: 500 },
    );
    if (refreshedTokens) setTraktCookies(res, refreshedTokens);
    return res;
  }
}
