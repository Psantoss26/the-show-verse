import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  clearTraktCookies,
  getValidTraktToken,
  setTraktCookies,
  traktFetch,
} from "@/lib/trakt/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

const TMDB_KEY =
  process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";

const calendarCache = new Map();
const CACHE_TTL_MS = 3 * 60 * 1000;

function toDateOnly(value) {
  if (!value || typeof value !== "string") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function diffDaysInclusive(start, end) {
  const startTime = new Date(`${start}T00:00:00Z`).getTime();
  const endTime = new Date(`${end}T00:00:00Z`).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return 1;
  return Math.max(1, Math.min(62, Math.floor((endTime - startTime) / 86400000) + 1));
}

function cacheKeyFor(token, start, days) {
  return `${String(token || "").slice(0, 24)}:${start}:${days}`;
}

function readCache(key) {
  const entry = calendarCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    calendarCache.delete(key);
    return null;
  }
  return entry.data;
}

function writeCache(key, data) {
  if (calendarCache.size >= 150) {
    calendarCache.delete(calendarCache.keys().next().value);
  }
  calendarCache.set(key, { ts: Date.now(), data });
}

async function fetchTraktListIds(token, path) {
  const res = await traktFetch(path, {
    token,
    timeoutMs: 12000,
    retries: 1,
  });
  if (!res.ok) return new Set();

  const rows = Array.isArray(res.json) ? res.json : [];
  return new Set(
    rows
      .flatMap((row) => [row?.show?.ids?.trakt, row?.show?.ids?.tmdb])
      .filter(Boolean)
      .map(String),
  );
}

async function fetchCalendar(token, path) {
  const res = await traktFetch(path, {
    token,
    timeoutMs: 15000,
    retries: 1,
  });
  if (!res.ok) {
    const err = new Error(`Trakt calendar failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return Array.isArray(res.json) ? res.json : [];
}

async function fetchTmdbShow(tmdbId) {
  if (!TMDB_KEY || !tmdbId) return null;

  const url =
    `${TMDB_BASE}/tv/${encodeURIComponent(tmdbId)}` +
    `?api_key=${encodeURIComponent(TMDB_KEY)}` +
    "&language=es-ES";

  const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 } });
  if (!res.ok) return null;

  const json = await res.json().catch(() => null);
  if (!json) return null;

  return {
    name: json?.name || null,
    poster_path: json?.poster_path || null,
    backdrop_path: json?.backdrop_path || null,
    first_air_date: json?.first_air_date || null,
  };
}

async function mapLimit(items, limit, mapper) {
  const out = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (index < items.length) {
      const current = index++;
      out[current] = await mapper(items[current], current);
    }
  });
  await Promise.all(workers);
  return out;
}

function buildSources(show, watchlistIds, favoriteIds) {
  const ids = [show?.ids?.trakt, show?.ids?.tmdb].filter(Boolean).map(String);
  const sources = [];
  if (ids.some((id) => watchlistIds.has(id))) sources.push("watchlist");
  if (ids.some((id) => favoriteIds.has(id))) sources.push("favorite");
  return sources;
}

function calendarRowKey(row) {
  const showId = row?.show?.ids?.trakt || row?.show?.ids?.tmdb || "show";
  const season = row?.episode?.season ?? "s";
  const number = row?.episode?.number ?? "e";
  const aired = row?.first_aired || "";
  return `${showId}:${season}:${number}:${aired}`;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const start = toDateOnly(searchParams.get("start"));
  const end = toDateOnly(searchParams.get("end")) || start;

  if (!start || !end) {
    return NextResponse.json(
      { connected: false, items: [], error: "Missing start/end date" },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();
  const { token, refreshedTokens, shouldClear } =
    await getValidTraktToken(cookieStore);

  if (!token) {
    const res = NextResponse.json({ connected: false, items: [] });
    if (shouldClear) clearTraktCookies(res);
    return res;
  }

  const days = diffDaysInclusive(start, end);
  const key = cacheKeyFor(token, start, days);
  const cached = readCache(key);
  if (cached) {
    const res = NextResponse.json(cached);
    if (refreshedTokens) setTraktCookies(res, refreshedTokens);
    return res;
  }

  try {
    const [watchlistIds, favoriteIds] = await Promise.all([
      fetchTraktListIds(token, "/sync/watchlist/shows?extended=full"),
      fetchTraktListIds(token, "/sync/favorites/shows?extended=full"),
    ]);

    const myPath = `/calendars/my/shows/${encodeURIComponent(start)}/${days}?extended=full`;
    const allPath = `/calendars/all/shows/${encodeURIComponent(start)}/${days}?extended=full`;
    const [myCalendarRows, favoriteCalendarRows] = await Promise.all([
      fetchCalendar(token, myPath),
      favoriteIds.size > 0
        ? fetchCalendar(token, allPath).catch(() => [])
        : Promise.resolve([]),
    ]);

    const calendarRows = [...myCalendarRows, ...favoriteCalendarRows];

    const filteredRows = calendarRows.filter((row) => {
      const sources = buildSources(row?.show, watchlistIds, favoriteIds);
      return sources.length > 0;
    });

    const uniqueRows = Array.from(
      new Map(filteredRows.map((row) => [calendarRowKey(row), row])).values(),
    );

    // Agrupar por tmdbId para evitar llamadas duplicadas a TMDb
    const uniqueTmdbIds = [
      ...new Set(
        uniqueRows.map((r) => r?.show?.ids?.tmdb).filter(Boolean),
      ),
    ];
    const tmdbResults = await mapLimit(uniqueTmdbIds, 8, fetchTmdbShow);
    const tmdbMap = new Map(
      uniqueTmdbIds.map((id, i) => [id, tmdbResults[i]]),
    );

    const mapped = uniqueRows.map((row) => {
      const show = row?.show || {};
      const episode = row?.episode || {};
      const tmdbId = show?.ids?.tmdb || null;
      const traktId = show?.ids?.trakt || null;
      const tmdb = tmdbId ? tmdbMap.get(tmdbId) : null;
      const sources = buildSources(show, watchlistIds, favoriteIds);

      return {
        id: `${traktId || tmdbId}-${episode?.season}-${episode?.number}`,
        type: "episode",
        source: sources,
        first_aired: row?.first_aired || null,
        show: {
          traktId,
          tmdbId,
          title: tmdb?.name || show?.title || "Sin título",
          year: show?.year || null,
          poster_path: tmdb?.poster_path || null,
          backdrop_path: tmdb?.backdrop_path || null,
          first_air_date: tmdb?.first_air_date || null,
        },
        episode: {
          season: episode?.season ?? null,
          number: episode?.number ?? null,
          title: episode?.title || null,
          ids: episode?.ids || {},
        },
      };
    });

    const data = {
      connected: true,
      items: mapped
        .filter((item) => item?.show?.tmdbId && item?.episode?.season != null)
        .sort((a, b) => (a.first_aired || "").localeCompare(b.first_aired || "")),
    };

    writeCache(key, data);

    const res = NextResponse.json(data);
    if (refreshedTokens) setTraktCookies(res, refreshedTokens);
    return res;
  } catch (err) {
    console.error("Error en /api/trakt/calendar/episodes:", err);
    const res = NextResponse.json(
      {
        connected: true,
        items: [],
        error: err?.message || "No se pudieron cargar episodios de Trakt",
      },
      { status: 200 },
    );
    if (refreshedTokens) setTraktCookies(res, refreshedTokens);
    return res;
  }
}
