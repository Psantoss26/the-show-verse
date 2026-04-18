// src/app/api/trakt/item/status/route.js
import { NextResponse } from "next/server";
import {
  getValidTraktToken,
  setTraktCookies,
  clearTraktCookies,
  traktGetHistoryForItem,
  traktGetProgressWatchedForShow,
  computeHistorySummary,
  mapHistoryEntries,
} from "@/lib/trakt/server";
import { resolveTraktEntityFromTmdb } from "@/lib/trakt/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0; // Nunca cachear
export const maxDuration = 10; // Límite máximo Vercel Hobby (s)

// Añade headers de no-cache a todas las respuestas para prevenir caché en CDN/Vercel
function noCacheHeaders(response) {
  response.headers.set(
    "Cache-Control",
    "private, no-store, no-cache, must-revalidate, max-age=0",
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
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
      return noCacheHeaders(res);
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
        const resolved = await resolveTraktEntityFromTmdb({ type, tmdbId });
        if (resolved?.traktId) {
          const ids = {
            ...(resolved.ids || {}),
            trakt: resolved.traktId,
            slug: resolved.slug || resolved.ids?.slug || null,
          };
          hit = type === "movie" ? { movie: { ids } } : { show: { ids } };
        }
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
        return noCacheHeaders(res);
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
      return noCacheHeaders(res);
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
        // Single fetch — client-side confirmMovieTraktStatus already handles
        // post-write retries with delays. Adding retries here caused timeouts
        // on Vercel (maxDuration=10) for unwatched movies because the loop
        // always ran all 3 attempts (including waits) when history was empty.
        history = await traktGetHistoryForItem(token, {
          type,
          traktId,
          limit: 10,
          timeoutMs: 5000,
        });
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
    return noCacheHeaders(res);
  } catch (e) {
    if (e?.status === 401) {
      const res = NextResponse.json({ connected: false }, { status: 401 });
      clearTraktCookies(res);
      if (refreshedTokens) setTraktCookies(res, refreshedTokens);
      return noCacheHeaders(res);
    }

    const transientAfterAuth =
      authVerified &&
      (e?.status === 403 ||
        e?.status === 429 ||
        // 5xx from Trakt or a Vercel lambda kill signal should degrade gracefully,
        // not clear the auth session.
        (typeof e?.status === "number" && e.status >= 500) ||
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
    return noCacheHeaders(res);
  }
}
