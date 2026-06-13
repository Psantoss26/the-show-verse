import { NextResponse } from "next/server";
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

const TMDB_KEY =
  process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";

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

export async function GET(request) {
  let responseCookies = {
    refreshedTokens: null,
    shouldClear: false,
  };

  try {
    const { token, refreshedTokens, shouldClear } = await getValidTraktToken(
      request.cookies,
    ).catch(() => ({ token: null, refreshedTokens: null, shouldClear: false }));
    responseCookies = { refreshedTokens, shouldClear };

    const recommended = token
      ? await getTraktRecommendedByType(30, "weekly", { token }).catch(
          () => null,
        )
      : null;
    const hasRecommended =
      recommended?.items?.length ||
      recommended?.movies?.length ||
      recommended?.shows?.length;
    const payload = hasRecommended
      ? recommended
      : await getFallbackRecommended(30);

    const res = NextResponse.json(payload);
    if (shouldClear) clearTraktCookies(res);
    if (refreshedTokens) setTraktCookies(res, refreshedTokens);
    return res;
  } catch (err) {
    console.error("Error en /api/trakt/dashboard/recommended:", err);
    const res = NextResponse.json(await getFallbackRecommended(30));
    if (responseCookies.shouldClear) clearTraktCookies(res);
    if (responseCookies.refreshedTokens) {
      setTraktCookies(res, responseCookies.refreshedTokens);
    }
    return res;
  }
}
