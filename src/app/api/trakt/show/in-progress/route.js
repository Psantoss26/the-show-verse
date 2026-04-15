// /src/app/api/trakt/show/in-progress/route.js
// Devuelve las series que el usuario está viendo activamente (en progreso)
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  readTraktCookies,
  tokenIsExpired,
  refreshAccessToken,
  setTraktCookies,
  traktFetch,
} from "@/lib/trakt/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

const TMDB_KEY =
  process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";

// ---------------------------------------------------------------------------
// Caché en memoria del lado servidor (por instancia Node). Permite que cargas
// sucesivas dentro de la misma instancia sean prácticamente instantáneas.
// Clave: primeros 24 caracteres del access token (suficiente para unicidad).
// ---------------------------------------------------------------------------
const _progressCache = new Map(); // cacheKey -> { ts, data }
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutos

function _getCacheKey(token) {
  return typeof token === "string" && token.length > 0
    ? token.slice(0, 24)
    : null;
}

function _readCache(key) {
  if (!key) return null;
  const entry = _progressCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    _progressCache.delete(key);
    return null;
  }
  return entry.data;
}

function _writeCache(key, data) {
  if (!key) return;
  // Limitar tamaño máximo para evitar fugas de memoria
  if (_progressCache.size >= 200) {
    _progressCache.delete(_progressCache.keys().next().value);
  }
  _progressCache.set(key, { ts: Date.now(), data });
}

export function invalidateInProgressCache(token) {
  const key = _getCacheKey(token);
  if (key) _progressCache.delete(key);
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

async function fetchShowProgress(
  token,
  traktId,
  { timeoutMs = 10000, retries = 0 } = {},
) {
  const progressRes = await traktFetch(
    `/shows/${encodeURIComponent(traktId)}/progress/watched?hidden=false&specials=false&count_specials=false`,
    { token, timeoutMs, retries },
  );

  if (!progressRes.ok) {
    const err = new Error(
      progressRes?.json?.error ||
        progressRes?.json?.message ||
        `Trakt show progress failed (${progressRes.status})`,
    );
    err.status = progressRes.status;
    throw err;
  }

  return progressRes.json || null;
}

export async function GET() {
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

    // Devolver desde caché si los datos aún son frescos (≤3 min)
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
      {
        token,
        timeoutMs: 15000,
        retries: 1,
      },
    );
    if (!watchedRes.ok)
      throw new Error(`Trakt watched shows failed (${watchedRes.status})`);

    const watchedShowsRaw = Array.isArray(watchedRes.json)
      ? watchedRes.json
      : [];
    const watchedShows = watchedShowsRaw.filter((item, index, arr) => {
      const traktId = item?.show?.ids?.trakt;
      if (!traktId) return false;
      return (
        arr.findIndex(
          (candidate) => candidate?.show?.ids?.trakt === traktId,
        ) === index
      );
    });

    // 2. Progreso detallado de cada serie (concurrencia 8 para reducir tiempo a la mitad)
    const progressResults = await mapLimit(watchedShows, 8, async (item) => {
      const show = item?.show;
      const traktId = show?.ids?.trakt;
      const tmdbId = show?.ids?.tmdb;
      if (!traktId || !tmdbId) return null;

      try {
        const progress = await fetchShowProgress(token, traktId, {
          timeoutMs: 10000,
          retries: 0,
        });
        const aired = progress?.aired || 0;
        const completed = progress?.completed || 0;

        // Solo series en progreso (al menos 1 episodio visto pero no completada)
        if (completed <= 0 || completed >= aired) return null;

        const pct = aired > 0 ? Math.round((completed / aired) * 100) : 0;
        const nextEp = progress?.next_episode || null;
        const lastEp = progress?.last_episode || null;
        const lastWatchedAt =
          progress?.last_watched_at || item?.last_watched_at || null;

        return {
          traktId,
          tmdbId,
          title: show?.title || "Sin título",
          year: show?.year || null,
          aired,
          completed,
          pct,
          nextEpisode: nextEp
            ? {
                season: nextEp.season,
                number: nextEp.number,
                title: nextEp.title || null,
              }
            : null,
          lastEpisode: lastEp
            ? {
                season: lastEp.season,
                number: lastEp.number,
                title: lastEp.title || null,
              }
            : null,
          lastWatchedAt,
        };
      } catch {
        return null;
      }
    });

    const inProgress = progressResults.filter(Boolean);

    // Ordenar por último visto (más reciente primero)
    inProgress.sort((a, b) => {
      const ta = new Date(a.lastWatchedAt || 0).getTime();
      const tb = new Date(b.lastWatchedAt || 0).getTime();
      return tb - ta;
    });

    // 3. Enriquecer con datos de TMDb (ya están en caché ISR de Next.js)
    const enriched = await mapLimit(inProgress, 8, async (item) => {
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
        avgProgress:
          enriched.length > 0
            ? Math.round(
                enriched.reduce((s, x) => s + x.pct, 0) / enriched.length,
              )
            : 0,
        totalEpisodesWatched: enriched.reduce((s, x) => s + x.completed, 0),
        totalEpisodesRemaining: enriched.reduce(
          (s, x) => s + (x.aired - x.completed),
          0,
        ),
      },
    };

    // Guardar en caché servidor para las siguientes cargas
    _writeCache(cacheKey, responseData);

    const res = NextResponse.json(responseData);
    if (refreshedTokens) setTraktCookies(res, refreshedTokens);
    return res;
  } catch (e) {
    const res = NextResponse.json(
      {
        connected: true,
        error: e?.message || "Error cargando series en progreso",
        items: [],
      },
      { status: 500 },
    );
    if (refreshedTokens) setTraktCookies(res, refreshedTokens);
    return res;
  }
}
