import { NextResponse } from "next/server";
import { createHash } from "crypto";
import {
  getTraktRecommendedByType,
  removeDuplicates,
} from "@/lib/api/traktHelpers";
import {
  clearTraktCookies,
  getValidTraktToken,
  setTraktCookies,
} from "@/lib/trakt/server";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 18;
const MAX_LIMIT = 30;
const FRESH_CACHE_MS = 15 * 60 * 1000;
const STALE_CACHE_MS = 6 * 60 * 60 * 1000;
const PERSONAL_TIMEOUT_MS = 2500;

const recommendedCache =
  globalThis.__showverseDashboardRecommendedCache ||
  new Map();
globalThis.__showverseDashboardRecommendedCache = recommendedCache;

const TMDB_KEY =
  process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";

function clampLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(6, Math.round(parsed)));
}

function hashToken(token) {
  if (!token) return "public";
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

function getCacheKey({ token, limit }) {
  return `${token ? "personal" : "public"}:${hashToken(token)}:${limit}`;
}

function isFresh(entry) {
  return entry && Date.now() - entry.updatedAt < FRESH_CACHE_MS;
}

function isStaleUsable(entry) {
  return entry && Date.now() - entry.updatedAt < STALE_CACHE_MS;
}

function hasPayload(payload) {
  return Boolean(
    payload?.items?.length || payload?.movies?.length || payload?.shows?.length,
  );
}

function createRecommendedResponse(payload, { cacheStatus, token }) {
  const res = NextResponse.json(payload);
  res.headers.set("X-Showverse-Recommended-Cache", cacheStatus);
  res.headers.set(
    "Cache-Control",
    token
      ? "private, max-age=300, stale-while-revalidate=3600"
      : "public, s-maxage=1800, stale-while-revalidate=3600",
  );
  return res;
}

async function tmdb(path, params = {}) {
  if (!TMDB_KEY) return [];

  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", TMDB_KEY);
  url.searchParams.set("language", "es-ES");

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });

  const res = await fetch(url, {
    cache: "force-cache",
    next: { revalidate: 60 * 30 },
  });
  if (!res.ok) return [];

  const json = await res.json().catch(() => null);
  return Array.isArray(json?.results) ? json.results : [];
}

function withMediaType(item, mediaType) {
  if (!item?.id || !item?.poster_path) return null;
  return {
    ...item,
    media_type: mediaType,
    source: "tmdb",
    sources: ["tmdb"],
    trakt_recommendation_source: "fallback",
  };
}

async function getFallbackRecommended(limit = 30) {
  const [movies, shows] = await Promise.all([
    tmdb("/discover/movie", {
      sort_by: "popularity.desc",
      "vote_average.gte": 6.8,
      "vote_count.gte": 900,
      page: 1,
    }),
    tmdb("/discover/tv", {
      sort_by: "popularity.desc",
      "vote_average.gte": 6.8,
      "vote_count.gte": 500,
      page: 1,
    }),
  ]);

  const movieItems = removeDuplicates(
    movies.map((item) => withMediaType(item, "movie")).filter(Boolean),
  ).slice(0, limit);
  const showItems = removeDuplicates(
    shows.map((item) => withMediaType(item, "tv")).filter(Boolean),
  ).slice(0, limit);

  const items = [];
  const max = Math.max(movieItems.length, showItems.length);
  for (let index = 0; index < max && items.length < limit; index += 1) {
    if (movieItems[index]) items.push(movieItems[index]);
    if (items.length >= limit) break;
    if (showItems[index]) items.push(showItems[index]);
  }

  return {
    items: removeDuplicates(items).slice(0, limit),
    movies: movieItems,
    shows: showItems,
    source: "fallback",
  };
}

async function buildRecommendedPayload({ token, limit }) {
  const recommended = token
    ? await getTraktRecommendedByType(limit, "weekly", {
        token,
        personalTimeoutMs: PERSONAL_TIMEOUT_MS,
        personalRetries: 0,
      }).catch(() => null)
    : await getTraktRecommendedByType(limit, "weekly").catch(() => null);

  const hasRecommended = hasPayload(recommended);
  const payload = hasRecommended
    ? recommended
    : await getFallbackRecommended(limit);

  return {
    ...payload,
    items: removeDuplicates(payload?.items || []).slice(0, limit),
    movies: removeDuplicates(payload?.movies || []).slice(0, limit),
    shows: removeDuplicates(payload?.shows || []).slice(0, limit),
  };
}

function refreshRecommendedCache(cacheKey, options) {
  const current = recommendedCache.get(cacheKey);
  if (current?.promise) return current.promise;

  const promise = buildRecommendedPayload(options)
    .then((payload) => {
      recommendedCache.set(cacheKey, {
        payload,
        updatedAt: Date.now(),
        promise: null,
      });
      return payload;
    })
    .catch((err) => {
      const previous = recommendedCache.get(cacheKey);
      if (previous?.payload) {
        recommendedCache.set(cacheKey, { ...previous, promise: null });
      } else {
        recommendedCache.delete(cacheKey);
      }
      throw err;
    });

  recommendedCache.set(cacheKey, {
    payload: current?.payload || null,
    updatedAt: current?.updatedAt || 0,
    promise,
  });

  return promise;
}

export async function GET(request) {
  let responseCookies = {
    refreshedTokens: null,
    shouldClear: false,
  };

  try {
    const limit = clampLimit(request.nextUrl?.searchParams?.get("limit"));
    const { token, refreshedTokens, shouldClear } = await getValidTraktToken(
      request.cookies,
    ).catch(() => ({ token: null, refreshedTokens: null, shouldClear: false }));
    responseCookies = { refreshedTokens, shouldClear };

    const cacheKey = getCacheKey({ token, limit });
    const cached = recommendedCache.get(cacheKey);

    if (isFresh(cached)) {
      const res = createRecommendedResponse(cached.payload, {
        cacheStatus: "hit",
        token,
      });
      if (shouldClear) clearTraktCookies(res);
      if (refreshedTokens) setTraktCookies(res, refreshedTokens);
      return res;
    }

    if (isStaleUsable(cached)) {
      refreshRecommendedCache(cacheKey, { token, limit }).catch((err) => {
        console.warn(
          "No se pudo refrescar recomendaciones en segundo plano:",
          err?.message || err,
        );
      });
      const res = createRecommendedResponse(cached.payload, {
        cacheStatus: "stale",
        token,
      });
      if (shouldClear) clearTraktCookies(res);
      if (refreshedTokens) setTraktCookies(res, refreshedTokens);
      return res;
    }

    const payload = await refreshRecommendedCache(cacheKey, { token, limit });

    const res = createRecommendedResponse(payload, {
      cacheStatus: "miss",
      token,
    });
    if (shouldClear) clearTraktCookies(res);
    if (refreshedTokens) setTraktCookies(res, refreshedTokens);
    return res;
  } catch (err) {
    console.error("Error en /api/trakt/dashboard/recommended:", err);
    const fallbackLimit = clampLimit(
      request.nextUrl?.searchParams?.get("limit"),
    );
    const res = createRecommendedResponse(
      await getFallbackRecommended(fallbackLimit),
      {
        cacheStatus: "fallback",
        token: false,
      },
    );
    if (responseCookies.shouldClear) clearTraktCookies(res);
    if (responseCookies.refreshedTokens) {
      setTraktCookies(res, responseCookies.refreshedTokens);
    }
    return res;
  }
}
