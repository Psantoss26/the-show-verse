import { NextResponse } from "next/server";
import {
  clearTraktCookies,
  getValidTraktToken,
  mapProgressWatchedBySeason,
  normalizeWatchedAt,
  setTraktCookies,
  traktGetProgressWatchedForShow,
  traktSearchByTmdb,
} from "@/lib/trakt/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const TRAKT_BASE = "https://api.trakt.tv";

function traktUserAgent() {
  return (
    process.env.TRAKT_USER_AGENT || "TheShowVerse/1.0 (Next.js; Trakt Sync)"
  );
}

function traktHeaders(token) {
  const clientId = process.env.TRAKT_CLIENT_ID;
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "trakt-api-version": "2",
    "trakt-api-key": clientId,
    Authorization: `Bearer ${token}`,
    "User-Agent": traktUserAgent(),
  };
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { tmdbId, season, watched, watchedAt } = body || {};

  const showTmdbId = Number(tmdbId);
  const seasonNumber = Number(season);

  if (!Number.isFinite(showTmdbId) || showTmdbId <= 0) {
    return NextResponse.json({ error: "Missing tmdbId" }, { status: 400 });
  }
  if (!Number.isFinite(seasonNumber) || seasonNumber <= 0) {
    return NextResponse.json({ error: "Invalid season" }, { status: 400 });
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

    const hit = await traktSearchByTmdb(token, {
      type: "show",
      tmdbId: showTmdbId,
    });
    const show = hit?.show || null;
    const traktId = show?.ids?.trakt || null;

    if (!show?.ids || !traktId) {
      const res = NextResponse.json(
        {
          connected: true,
          found: false,
          traktId: null,
          watchedBySeason: {},
        },
        { status: 404 },
      );
      if (refreshedTokens) setTraktCookies(res, refreshedTokens);
      return res;
    }

    const endpoint = watched
      ? `${TRAKT_BASE}/sync/history`
      : `${TRAKT_BASE}/sync/history/remove`;
    const payload = watched
      ? {
          shows: [
            {
              ids: show.ids,
              seasons: [
                {
                  number: seasonNumber,
                  watched_at: normalizeWatchedAt(watchedAt),
                },
              ],
            },
          ],
        }
      : {
          shows: [
            {
              ids: show.ids,
              seasons: [{ number: seasonNumber }],
            },
          ],
        };

    const syncRes = await fetch(endpoint, {
      method: "POST",
      headers: traktHeaders(token),
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const syncJson = await syncRes.json().catch(() => ({}));
    if (!syncRes.ok) {
      const res = NextResponse.json(
        {
          connected: true,
          error: syncJson?.error || syncJson?.message || "Trakt season sync failed",
        },
        { status: syncRes.status || 500 },
      );
      if (refreshedTokens) setTraktCookies(res, refreshedTokens);
      return res;
    }

    const progress = await traktGetProgressWatchedForShow(token, { traktId });
    const watchedBySeason = mapProgressWatchedBySeason(progress);

    const res = NextResponse.json({
      connected: true,
      ok: true,
      found: true,
      traktId,
      watched: !!watched,
      watchedBySeason,
      summary: syncJson,
    });
    if (refreshedTokens) setTraktCookies(res, refreshedTokens);
    return res;
  } catch (e) {
    const res = NextResponse.json(
      { connected: true, error: e?.message || "Trakt season watched failed" },
      { status: 500 },
    );
    if (refreshedTokens) setTraktCookies(res, refreshedTokens);
    return res;
  }
}
