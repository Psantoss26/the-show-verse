import { NextResponse } from "next/server";
import { getTraktRecommended, removeDuplicates } from "@/lib/api/traktHelpers";
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

  const mixed = [];
  const max = Math.max(movies.length, shows.length);
  for (let index = 0; index < max && mixed.length < limit; index += 1) {
    const movie = withMediaType(movies[index], "movie");
    if (movie) mixed.push(movie);
    if (mixed.length >= limit) break;

    const show = withMediaType(shows[index], "tv");
    if (show) mixed.push(show);
  }

  return removeDuplicates(mixed).slice(0, limit);
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

    const traktItems = token
      ? await getTraktRecommended(30, "weekly", { token }).catch(() => [])
      : [];
    const items =
      Array.isArray(traktItems) && traktItems.length > 0
        ? traktItems
        : await getFallbackRecommended(30);

    const res = NextResponse.json(items || []);
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
