// src/app/api/trakt/movie/watched/route.js
import { NextResponse } from "next/server";
import {
  getValidTraktToken,
  setTraktCookies,
  clearTraktCookies,
  traktGetHistoryForItem,
  computeHistorySummary,
  mapHistoryEntries,
} from "@/lib/trakt/server";
import { resolveTraktEntityFromTmdb } from "@/lib/trakt/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

function resolveWithin(promise, timeoutMs, fallback = null) {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      setTimeout(() => resolve(fallback), timeoutMs);
    }),
  ]);
}

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
    const [tokenResult, resolvedResult] = await Promise.all([
      getValidTraktToken(cookieStore),
      traktIdParam
        ? Promise.resolve({
            traktId: String(traktIdParam),
            ids: { trakt: String(traktIdParam) },
            slug: null,
          })
        : resolveWithin(
            resolveTraktEntityFromTmdb({ type: "movie", tmdbId }),
            2500,
            "TRAKT_RESOLVE_TIMEOUT",
          ),
    ]);

    const t = tokenResult;
    token = t.token;
    refreshedTokens = t.refreshedTokens;
    shouldClear = t.shouldClear;

    if (!token) {
      const res = NextResponse.json({
        connected: false,
        found: false,
        watched: false,
        plays: 0,
        lastWatchedAt: null,
        history: [],
      });
      if (shouldClear) clearTraktCookies(res);
      return res;
    }
    authVerified = true;

    let resolved = null;
    if (resolvedResult === "TRAKT_RESOLVE_TIMEOUT") {
      const res = NextResponse.json({
        connected: true,
        found: false,
        traktId: null,
        traktUrl: null,
        watched: false,
        plays: 0,
        lastWatchedAt: null,
        history: [],
        degraded: true,
        error: "Trakt movie resolve timeout",
      });
      if (refreshedTokens) setTraktCookies(res, refreshedTokens);
      return res;
    }
    resolved = resolvedResult;

    const traktId = resolved?.traktId || null;
    if (!traktId) {
      const res = NextResponse.json({
        connected: true,
        found: false,
        traktId: null,
        traktUrl: null,
        watched: false,
        plays: 0,
        lastWatchedAt: null,
        history: [],
      });
      if (refreshedTokens) setTraktCookies(res, refreshedTokens);
      return res;
    }

    const hit = {
      movie: {
        ids: {
          ...(resolved?.ids || {}),
          trakt: traktId,
          slug: resolved?.slug || resolved?.ids?.slug || null,
        },
      },
    };

    const history = await traktGetHistoryForItem(token, {
      type: "movie",
      traktId,
      limit: 10,
      timeoutMs: 3500,
    });
    const summary = computeHistorySummary({
      searchHit: hit,
      history,
      type: "movie",
    });

    const res = NextResponse.json({
      connected: true,
      ...summary,
      traktId,
      history: mapHistoryEntries(history),
    });
    if (refreshedTokens) setTraktCookies(res, refreshedTokens);
    return res;
  } catch (e) {
    if (e?.status === 401) {
      const res = NextResponse.json(
        {
          connected: false,
          found: false,
          watched: false,
          plays: 0,
          lastWatchedAt: null,
          history: [],
        },
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
        (typeof e?.status === "number" && e.status >= 500) ||
        /timeout|tempor|aborted|fetch/i.test(e?.message || ""));

    const res = NextResponse.json(
      transientAfterAuth
        ? {
            connected: true,
            found: false,
            watched: false,
            plays: 0,
            lastWatchedAt: null,
            history: [],
            degraded: true,
            error: e?.message || "Trakt movie watched failed",
          }
        : {
            connected: false,
            found: false,
            watched: false,
            plays: 0,
            lastWatchedAt: null,
            history: [],
            error: e?.message || "Trakt movie watched failed",
          },
      { status: transientAfterAuth ? 200 : 500 },
    );
    if (refreshedTokens) setTraktCookies(res, refreshedTokens);
    return res;
  }
}
