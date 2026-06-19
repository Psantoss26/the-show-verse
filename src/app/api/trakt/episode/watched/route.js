// src/app/api/trakt/episode/watched/route.js
import { NextResponse } from "next/server";
import {
  getValidTraktToken,
  setTraktCookies,
  clearTraktCookies,
  normalizeWatchedAt,
  traktAddEpisodeToHistory,
  traktRemoveEpisodeFromHistory,
  traktSearchByTmdb,
  traktGetProgressWatchedForShow,
  mapProgressWatchedBySeason,
} from "@/lib/trakt/server";
import { backendFetchJson, setBackendAuthCookies } from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { tmdbId, season, episode, watched, watchedAt } = body || {};

  if (!tmdbId) {
    return NextResponse.json({ error: "Missing tmdbId" }, { status: 400 });
  }
  const sn = Number(season);
  const en = Number(episode);
  if (!Number.isFinite(sn) || sn <= 0) {
    return NextResponse.json({ error: "Invalid season" }, { status: 400 });
  }
  if (!Number.isFinite(en) || en <= 0) {
    return NextResponse.json({ error: "Invalid episode" }, { status: 400 });
  }

  try {
    const watchedAtIso = normalizeWatchedAt(watchedAt);
    const backend = await backendFetchJson(request, "/v1/history/episodes", {
      method: "POST",
      body: JSON.stringify({
        tmdbId: Number(tmdbId),
        season: sn,
        episode: en,
        watched: Boolean(watched),
        watchedAt: watchedAtIso || undefined,
        title: body?.title,
        posterPath: body?.posterPath,
      }),
    });

    if (backend.ok) {
      const res = NextResponse.json({
        connected: true,
        ok: true,
        watched: Boolean(watched),
        found: true,
        traktId: null,
        watchedBySeason: backend.json?.watchedBySeason || {},
        source: "backend",
      });
      setBackendAuthCookies(res, backend, { secure: request.nextUrl.protocol === "https:" });
      return res;
    }
    if (!backend.skipped && backend.status !== 401) {
      console.warn("Backend episode watched failed; falling back to Trakt", backend.error);
    }
  } catch (e) {
    console.warn("Backend episode watched failed; falling back to Trakt", e);
  }

  const cookieStore = request.cookies;
  let token = null;
  let refreshedTokens = null;
  let shouldClear = false;

  try {
    const t = await getValidTraktToken(cookieStore);
    token = t.token;
    refreshedTokens = t.refreshedTokens;
    shouldClear = t.shouldClear;

    if (!token) {
      const res = NextResponse.json({ connected: false }, { status: 401 });
      if (shouldClear) clearTraktCookies(res);
      return res;
    }

    if (watched) {
      const watchedAtIso = normalizeWatchedAt(watchedAt);
      await traktAddEpisodeToHistory(token, {
        showTmdbId: tmdbId,
        season: sn,
        episode: en,
        watchedAtIso,
      });
    } else {
      await traktRemoveEpisodeFromHistory(token, {
        showTmdbId: tmdbId,
        season: sn,
        episode: en,
      });
    }

    let watchedBySeason = {};
    let traktId = null;
    let found = false;

    const hit = await traktSearchByTmdb(token, { type: "show", tmdbId });
    traktId = hit?.show?.ids?.trakt || null;
    found = !!traktId;

    if (traktId) {
      const progress = await traktGetProgressWatchedForShow(token, { traktId });
      watchedBySeason = mapProgressWatchedBySeason(progress);
    }

    const res = NextResponse.json({
      connected: true,
      ok: true,
      watched: !!watched,
      found,
      traktId,
      watchedBySeason,
    });
    if (refreshedTokens) setTraktCookies(res, refreshedTokens);
    return res;
  } catch (e) {
    const res = NextResponse.json(
      { connected: true, error: e?.message || "Trakt episode watched failed" },
      { status: 500 },
    );
    if (refreshedTokens) setTraktCookies(res, refreshedTokens);
    return res;
  }
}
