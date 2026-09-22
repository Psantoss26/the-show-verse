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
import {
  backendFetchJson,
  hasBackendCredentials,
  setBackendAuthCookies,
} from "@/lib/backend/server";
import {
  classifyBackendItemStatus,
  ITEM_STATUS_OUTCOME,
} from "@/lib/backend/itemStatusOutcome";

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

  // Mismo criterio que /api/trakt/item/status: si el backend no pudo contestar
  // (429, 5xx, red, timeout) no se sabe qué episodios hay vistos.
  let backendNoConcluyente = false;

  if (tmdbId) {
    try {
      const backend = await backendFetchJson(
        request,
        `/v1/history/shows/${encodeURIComponent(tmdbId)}`,
      );
      if (backend.ok) {
        const res = NextResponse.json({
          connected: true,
          found: Boolean(backend.json?.found),
          traktId: null,
          watchedBySeason: backend.json?.watchedBySeason || {},
          source: "backend",
        });
        setBackendAuthCookies(res, backend, { secure: request.nextUrl.protocol === "https:" });
        return res;
      }
      backendNoConcluyente =
        classifyBackendItemStatus(backend) === ITEM_STATUS_OUTCOME.NO_CONCLUYENTE;
      if (!backend.skipped && backend.status !== 401 && backend.status !== 404) {
        console.warn("Backend show watched failed; falling back to Trakt", backend.error);
      }
    } catch (e) {
      backendNoConcluyente = true;
      console.warn("Backend show watched failed; falling back to Trakt", e);
    }
  }

  // Sin sesión de Trakt (lo normal: el estado es del backend) se respondía
  // `{connected:false}` con 200 aunque el backend simplemente no hubiera podido
  // contestar. El cliente lo tomaba por "no conectado", dejaba los episodios sin
  // cargar y el botón de visto de las series se quedaba cargando para siempre.
  if (backendNoConcluyente && hasBackendCredentials(request)) {
    return NextResponse.json(
      { connected: false, degraded: true, error: "Backend show watched unavailable" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
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
