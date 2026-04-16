// src/app/api/trakt/show/watched/route.js
import { NextResponse } from "next/server";
import {
  getValidTraktToken,
  setTraktCookies,
  clearTraktCookies,
  traktSearchByTmdb,
  traktGetProgressWatchedForShow,
  mapProgressWatchedBySeason,
} from "@/lib/trakt/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET(request) {
  const tmdbId = request.nextUrl.searchParams.get("tmdbId");
  const traktIdParam = request.nextUrl.searchParams.get("traktId");
  if (!tmdbId && !traktIdParam) {
    return NextResponse.json(
      { error: "Missing tmdbId or traktId" },
      { status: 400 },
    );
  }

  const cookieStore = request.cookies;
  let token = null;
  let refreshedTokens = null;
  let shouldClear = false;
  let authVerified = false;

  try {
    const t = await getValidTraktToken(cookieStore);
    token = t.token;
    refreshedTokens = t.refreshedTokens;
    shouldClear = t.shouldClear;

    if (!token) {
      const res = NextResponse.json({ connected: false, found: false, watchedBySeason: {} });
      if (shouldClear) clearTraktCookies(res);
      return res;
    }
    authVerified = true;

    const traktId = traktIdParam
      ? String(traktIdParam)
      : (await traktSearchByTmdb(token, { type: "show", tmdbId }))?.show?.ids
          ?.trakt || null;

    if (!traktId) {
      const res = NextResponse.json({
        connected: true,
        found: false,
        traktId: null,
        watchedBySeason: {},
      });
      if (refreshedTokens) setTraktCookies(res, refreshedTokens);
      return res;
    }

    const progress = await traktGetProgressWatchedForShow(token, { traktId });
    const watchedBySeason = mapProgressWatchedBySeason(progress);

    const res = NextResponse.json({
      connected: true,
      found: true,
      traktId,
      watchedBySeason,
    });
    if (refreshedTokens) setTraktCookies(res, refreshedTokens);
    return res;
  } catch (e) {
    if (e?.status === 401) {
      const res = NextResponse.json(
        { connected: false, found: false, watchedBySeason: {} },
        { status: 401 },
      );
      clearTraktCookies(res);
      if (refreshedTokens) setTraktCookies(res, refreshedTokens);
      return res;
    }

    const transientAfterAuth =
      authVerified &&
      (e?.status === 403 ||
        e?.status === 429 ||
        /timeout|tempor|aborted|fetch/i.test(e?.message || ""));

    const res = NextResponse.json(
      transientAfterAuth
        ? {
            connected: true,
            found: false,
            watchedBySeason: {},
            degraded: true,
            error: e?.message || "Trakt show watched failed",
          }
        : {
            connected: false,
            found: false,
            watchedBySeason: {},
            error: e?.message || "Trakt show watched failed",
          },
      { status: transientAfterAuth ? 200 : 500 },
    );
    if (refreshedTokens) setTraktCookies(res, refreshedTokens);
    return res;
  }
}
