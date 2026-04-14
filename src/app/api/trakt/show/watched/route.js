// src/app/api/trakt/show/watched/route.js
import { NextResponse } from "next/server";
import {
  getValidTraktToken,
  setTraktCookies,
  clearTraktCookies,
  traktApi,
  traktSearchByTmdb,
  traktGetProgressWatchedForShow,
  mapProgressWatchedBySeason,
} from "@/lib/trakt/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET(request) {
  const tmdbId = request.nextUrl.searchParams.get("tmdbId");
  if (!tmdbId) {
    return NextResponse.json({ error: "Missing tmdbId" }, { status: 400 });
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

    const auth = await traktApi("/users/settings", { token });
    if (!auth.ok) {
      if (auth.status === 401) {
        const res = NextResponse.json({ connected: false, found: false, watchedBySeason: {} });
        clearTraktCookies(res);
        return res;
      }

      const res = NextResponse.json(
        {
          connected: true,
          found: false,
          watchedBySeason: {},
          degraded: true,
          upstreamStatus: auth.status,
          error: "Trakt upstream check failed",
        },
        { status: 200 },
      );
      if (refreshedTokens) setTraktCookies(res, refreshedTokens);
      return res;
    }
    authVerified = true;

    const hit = await traktSearchByTmdb(token, { type: "show", tmdbId });
    const traktId = hit?.show?.ids?.trakt || null;

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
