import { NextResponse } from "next/server";
import {
  clearTraktCookies,
  getValidTraktToken,
  setTraktCookies,
  traktFetch,
} from "@/lib/trakt/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noCacheHeaders(response) {
  response.headers.set(
    "Cache-Control",
    "private, no-store, no-cache, must-revalidate, max-age=0",
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

function normalizeKind(value) {
  return value === "watchlist" ? "watchlist" : "favorites";
}

function rowsToKeys(rows, objectKey, mediaType) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => row?.[objectKey]?.ids?.tmdb)
    .filter(Boolean)
    .map((tmdbId) => `${mediaType}:${tmdbId}`);
}

async function fetchPresenceKeys(token, kind, pathType, objectKey, mediaType) {
  const res = await traktFetch(`/sync/${kind}/${pathType}`, {
    token,
    timeoutMs: 12000,
    retries: 1,
  });
  if (!res.ok) return [];
  return rowsToKeys(res.json, objectKey, mediaType);
}

export async function GET(request) {
  const kind = normalizeKind(request.nextUrl.searchParams.get("kind"));
  const cookieStore = request.cookies;
  const { token, refreshedTokens, shouldClear } =
    await getValidTraktToken(cookieStore);

  if (!token) {
    const res = NextResponse.json({ connected: false, kind, keys: [] });
    if (shouldClear) clearTraktCookies(res);
    return noCacheHeaders(res);
  }

  try {
    const [movieKeys, tvKeys] = await Promise.all([
      fetchPresenceKeys(token, kind, "movies", "movie", "movie"),
      fetchPresenceKeys(token, kind, "shows", "show", "tv"),
    ]);

    const res = NextResponse.json({
      connected: true,
      kind,
      keys: [...new Set([...movieKeys, ...tvKeys])],
    });
    if (refreshedTokens) setTraktCookies(res, refreshedTokens);
    return noCacheHeaders(res);
  } catch (error) {
    const res = NextResponse.json(
      {
        connected: true,
        kind,
        keys: [],
        degraded: true,
        error: error?.message || "Trakt sync presence failed",
      },
      { status: 200 },
    );
    if (refreshedTokens) setTraktCookies(res, refreshedTokens);
    return noCacheHeaders(res);
  }
}
