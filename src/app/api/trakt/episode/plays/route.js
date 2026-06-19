// src/app/api/trakt/episode/plays/route.js
// Devuelve el historial de visionados de un episodio específico
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  setTraktCookies,
  getValidTraktToken,
  traktGetHistoryForItem,
  mapHistoryEntries,
} from "@/lib/trakt/server";
import { resolveTraktEntityFromTmdb } from "@/lib/trakt/resolve";
import { backendFetchJson, setBackendAuthCookies } from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const tmdbId = request.nextUrl.searchParams.get("tmdbId");
  const season = Number(request.nextUrl.searchParams.get("season"));
  const episode = Number(request.nextUrl.searchParams.get("episode"));

  if (!tmdbId || !Number.isFinite(season) || !Number.isFinite(episode)) {
    return NextResponse.json(
      { error: "Missing or invalid tmdbId, season, or episode" },
      { status: 400 },
    );
  }

  try {
    const backend = await backendFetchJson(
      request,
      `/v1/history/episodes/${encodeURIComponent(tmdbId)}/${season}/${episode}`,
    );
    if (backend.ok) {
      const res = NextResponse.json({
        connected: true,
        found: Boolean(backend.json?.found),
        plays: Number(backend.json?.plays || 0),
        lastWatchedAt: backend.json?.lastWatchedAt || null,
        history: Array.isArray(backend.json?.history) ? backend.json.history : [],
        source: "backend",
      });
      setBackendAuthCookies(res, backend, { secure: request.nextUrl.protocol === "https:" });
      return res;
    }
    if (!backend.skipped && backend.status !== 401 && backend.status !== 404) {
      console.warn("Backend episode plays failed; falling back to Trakt", backend.error);
    }
  } catch (e) {
    console.warn("Backend episode plays failed; falling back to Trakt", e);
  }

  const cookieStore = await cookies();
  let refreshedTokensFromToken = null;

  try {
    const { token, refreshedTokens, shouldClear } =
      await getValidTraktToken(cookieStore);
    refreshedTokensFromToken = refreshedTokens;
    if (!token) {
      const res = NextResponse.json({ connected: false, plays: 0, history: [] });
      if (shouldClear) setTraktCookies(res, null);
      return res;
    }

    const resolved = await resolveTraktEntityFromTmdb({
      type: "show",
      tmdbId: String(tmdbId),
    });
    const traktId = resolved?.traktId;
    if (!traktId) {
      const res = NextResponse.json({
        connected: true,
        found: false,
        plays: 0,
        lastWatchedAt: null,
        history: [],
      });
      return res;
    }

    // Obtener historial completo del show usando la función existente
    const allHistory = await traktGetHistoryForItem(token, {
      type: "show",
      traktId,
      limit: 1000,
      timeoutMs: 10000,
    });

    // Filtrar solo las entradas de este episodio
    const episodeHistory = allHistory.filter((entry) => {
      const ep = entry?.episode;
      return (
        ep &&
        Number(ep.season) === season &&
        Number(ep.number) === episode
      );
    });

    // Usar mapHistoryEntries para formatear igual que el resto del sistema
    const history = mapHistoryEntries(episodeHistory);

    const res = NextResponse.json({
      connected: true,
      found: true,
      plays: history.length,
      lastWatchedAt: history.length > 0 ? history[0].watchedAt : null,
      history,
    });

    if (refreshedTokensFromToken) setTraktCookies(res, refreshedTokensFromToken);
    return res;
  } catch (e) {
    const res = NextResponse.json(
      {
        connected: true,
        found: false,
        error: e?.message || "Error loading episode plays",
        plays: 0,
        lastWatchedAt: null,
        history: [],
      },
      { status: 500 },
    );
    if (refreshedTokensFromToken) setTraktCookies(res, refreshedTokensFromToken);
    return res;
  }
}
