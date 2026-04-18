// src/app/api/trakt/item/status/route.js
import { NextResponse } from "next/server";
import {
  getValidTraktToken,
  setTraktCookies,
  clearTraktCookies,
  traktSearchByTmdb,
  traktGetHistoryForItem,
  traktGetProgressWatchedForShow,
  computeHistorySummary,
  mapHistoryEntries,
} from "@/lib/trakt/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10; // Límite máximo Vercel Hobby (s)

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(request) {
  const type = request.nextUrl.searchParams.get("type"); // movie | show
  const tmdbId = request.nextUrl.searchParams.get("tmdbId");
  const traktIdParam = request.nextUrl.searchParams.get("traktId");

  if (type !== "movie" && type !== "show") {
    return NextResponse.json(
      { error: "Invalid type. Use movie|show." },
      { status: 400 },
    );
  }
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
      const res = NextResponse.json({ connected: false });
      if (shouldClear) clearTraktCookies(res);
      return res;
    }
    authVerified = true;

    let hit = null;
    try {
      if (traktIdParam) {
        hit =
          type === "movie"
            ? { movie: { ids: { trakt: String(traktIdParam) } } }
            : { show: { ids: { trakt: String(traktIdParam) } } };
      } else {
        hit = await traktSearchByTmdb(token, { type, tmdbId });
      }
    } catch (searchErr) {
      const isTransient =
        searchErr?.status === 403 ||
        searchErr?.status === 429 ||
        /timeout|tempor|aborted|fetch/i.test(searchErr?.message || "");

      if (isTransient) {
        console.warn(
          `⚠️ Trakt lookup temporal para ${type}/${tmdbId}; preservando sesión`,
        );
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
          error: searchErr?.message || "Trakt lookup failed",
        });
        if (refreshedTokens) setTraktCookies(res, refreshedTokens);
        return res;
      }

      throw searchErr;
    }

    if (!hit) {
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

    const obj = type === "movie" ? hit.movie : hit.show;
    const traktId = obj?.ids?.trakt;

    let history = [];
    let progress = null;
    let completed = 0;
    let aired = 0;

    if (traktId) {
      if (type === "show") {
        const [historyRes, progressRes] = await Promise.allSettled([
          traktGetHistoryForItem(token, { type, traktId, limit: 10 }),
          traktGetProgressWatchedForShow(token, { traktId }),
        ]);
        history = historyRes.status === "fulfilled" ? historyRes.value : [];
        if (progressRes.status === "fulfilled" && progressRes.value) {
          completed = Math.max(0, Number(progressRes.value.completed || 0));
          aired = Math.max(0, Number(progressRes.value.aired || 0));
          progress = aired > 0 ? Math.round((completed / aired) * 100) : 0;
        }
      } else {
        const historyRetryDelays = [0, 450, 1100];
        for (let attempt = 0; attempt < historyRetryDelays.length; attempt++) {
          if (attempt > 0) {
            await wait(historyRetryDelays[attempt]);
          }

          history = await traktGetHistoryForItem(token, {
            type,
            traktId,
            limit: 10,
          });

          if (Array.isArray(history) && history.length > 0) {
            break;
          }
        }
      }
    }

    const summary = computeHistorySummary({ searchHit: hit, history, type });

    const res = NextResponse.json({
      connected: true,
      ...summary,
      progress,
      completed,
      aired,
      traktId: traktId || null,
      history: mapHistoryEntries(history),
    });

    if (refreshedTokens) setTraktCookies(res, refreshedTokens);
    return res;
  } catch (e) {
    if (e?.status === 401) {
      const res = NextResponse.json({ connected: false }, { status: 401 });
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
            traktId: null,
            traktUrl: null,
            watched: false,
            plays: 0,
            lastWatchedAt: null,
            history: [],
            degraded: true,
            error: e?.message || "Trakt status failed",
          }
        : { connected: false, error: e?.message || "Trakt status failed" },
      { status: transientAfterAuth ? 200 : 500 },
    );
    // si refrescó antes de fallar, guardamos cookies igualmente
    if (refreshedTokens) setTraktCookies(res, refreshedTokens);
    return res;
  }
}
