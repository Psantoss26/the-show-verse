/**
 * /api/soundtrack — Multi-source soundtrack resolver
 *
 * Tries Spotify first (with OAuth), then falls back to iTunes Search API
 * (no auth, no rate limits), and finally Deezer API (no auth, generous limits).
 */

import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import {
  norm, tokens, sigTokens, unique, getYear,
  names, primaryImage, sleep, titleScore, bestTitleScore,
  yearScore, soundtrackBonus,
} from "@/lib/api/soundtrack-utils";
import { searchFallback } from "@/lib/api/soundtrack-fallback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

const REQUEST_TIMEOUT_MS = 9000;
const MAX_TRACKS = 40;
const MAX_PLAYLISTS = 4;
const MAX_ALBUMS = 4;
const SEARCH_LIMIT = 10;
const PLAYLIST_MIN_SCORE = 32;
const ALBUM_MIN_SCORE = 32;

const CACHE_DIR = path.join(process.cwd(), ".next", "cache", "spotify");
const CACHE_FILE = path.join(CACHE_DIR, "soundtrack.json");

const HIT_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const MISS_TTL_MS = 1000 * 60 * 30;
const MAX_CACHE_KEYS = 2000;

// ---------------------------------------------------------------------------
// Global in-process state
// ---------------------------------------------------------------------------
const g = globalThis;

g.__svSpToken = g.__svSpToken ?? { token: "", expiresAt: 0, mode: "" };
g.__svSpCache = g.__svSpCache ?? new Map();
g.__svSpRateBlock = g.__svSpRateBlock ?? { until: 0, retryAfter: "" };

// ---------------------------------------------------------------------------
// Spotify credentials & token
// ---------------------------------------------------------------------------
function credentials() {
  const id =
    process.env.SPOTIFY_CLIENT_ID ?? process.env.NEXT_SPOTIFY_CLIENT_ID;
  const secret =
    process.env.SPOTIFY_CLIENT_SECRET ??
    process.env.NEXT_SPOTIFY_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}

async function fetchJson(url, { label = "req", headers = {}, method = "GET", body } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      body,
      signal: ctrl.signal,
      headers: { accept: "application/json", ...headers },
    });
    if (!res.ok) {
      const err = Object.assign(new Error(`${label} ${res.status}`), {
        status: res.status,
        retryAfter: res.headers.get("retry-after") ?? "",
      });
      throw err;
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function getToken() {
  const creds = credentials();
  if (!creds) return { token: "", mode: "missing_credentials" };

  const cached = g.__svSpToken;
  if (cached.token && cached.expiresAt > Date.now() + 30_000) {
    return { token: cached.token, mode: cached.mode };
  }

  const basic = Buffer.from(`${creds.id}:${creds.secret}`).toString("base64");
  const authHeaders = {
    authorization: `Basic ${basic}`,
    "content-type": "application/x-www-form-urlencoded",
  };

  if (process.env.SPOTIFY_REFRESH_TOKEN) {
    try {
      const d = await fetchJson(SPOTIFY_TOKEN_URL, {
        label: "Spotify token (refresh)",
        method: "POST",
        headers: authHeaders,
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: process.env.SPOTIFY_REFRESH_TOKEN,
        }),
      });
      if (d?.access_token) {
        cached.token = d.access_token;
        cached.expiresAt = Date.now() + Number(d.expires_in ?? 3600) * 1000;
        cached.mode = "refresh_token";
        return { token: cached.token, mode: cached.mode };
      }
    } catch {
      cached.token = "";
      cached.expiresAt = 0;
    }
  }

  const d = await fetchJson(SPOTIFY_TOKEN_URL, {
    label: "Spotify token (client_credentials)",
    method: "POST",
    headers: authHeaders,
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  if (!d?.access_token) return { token: "", mode: "auth_failed" };

  cached.token = d.access_token;
  cached.expiresAt = Date.now() + Number(d.expires_in ?? 3600) * 1000;
  cached.mode = "client_credentials";
  return { token: cached.token, mode: cached.mode };
}

// ---------------------------------------------------------------------------
// Query construction (Spotify-specific field filters)
// ---------------------------------------------------------------------------
function buildQueries(ctx) {
  const primary = ctx.titles[0] ?? "";
  const alt = ctx.titles[1];
  const oscKeyword =
    ctx.mediaType === "tv"
      ? "original television soundtrack"
      : "original motion picture soundtrack";

  const qs = [];

  if (primary) {
    qs.push(`album:"${primary}" soundtrack`);
    qs.push(`album:"${primary}"`);
    if (ctx.year) {
      qs.push(`album:"${primary}" year:${ctx.year} soundtrack`);
    }
    qs.push(`"${primary}" ${oscKeyword}`);
  }

  if (alt && alt !== primary) {
    qs.push(`album:"${alt}" soundtrack`);
  }

  if (primary) {
    qs.push(`"${primary}" OST`);
  }

  return unique(qs).slice(0, 3);
}

// ---------------------------------------------------------------------------
// Circuit breaker
// ---------------------------------------------------------------------------
function isRateLimited() {
  return g.__svSpRateBlock.until > Date.now();
}

function setRateBlock(retryAfter) {
  const seconds = Number(retryAfter) || 60;
  g.__svSpRateBlock.until = Date.now() + seconds * 1000;
  g.__svSpRateBlock.retryAfter = retryAfter;
  console.warn(
    `[Spotify] Rate limited — blocked for ${seconds}s (until ${new Date(g.__svSpRateBlock.until).toISOString()})`,
  );
}

// ---------------------------------------------------------------------------
// Persistent disk cache
// ---------------------------------------------------------------------------
let _diskLoaded = false;
let _diskMap = new Map();

async function ensureCacheDir() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch { /* already exists */ }
}

async function loadDiskCache() {
  if (_diskLoaded) return;
  _diskLoaded = true;
  try {
    await ensureCacheDir();
    const raw = await fs.readFile(CACHE_FILE, "utf8");
    const obj = JSON.parse(raw);
    _diskMap = new Map(Object.entries(obj));
  } catch { /* first run or corrupt */ }
}

async function saveDiskCache() {
  try {
    await ensureCacheDir();
    if (_diskMap.size > MAX_CACHE_KEYS) {
      const sorted = [..._diskMap.entries()].sort((a, b) => a[1].ts - b[1].ts);
      _diskMap = new Map(sorted.slice(sorted.length - MAX_CACHE_KEYS));
    }
    const obj = Object.fromEntries(_diskMap.entries());
    await fs.writeFile(CACHE_FILE, JSON.stringify(obj), "utf8");
  } catch (e) {
    console.warn("[Spotify] disk cache write failed:", e?.message);
  }
}

function getCacheKey(ctx, market) {
  return `${norm(ctx.titles.join("|"))}|${ctx.mediaType}|${ctx.year ?? ""}|${market}`;
}

async function getCached(key) {
  await loadDiskCache();

  const mem = g.__svSpCache.get(key);
  if (mem) {
    const age = Date.now() - mem.ts;
    const ttl = mem.data?.tracks?.length > 0 ? HIT_TTL_MS : MISS_TTL_MS;
    if (age < ttl) return mem.data;
    g.__svSpCache.delete(key);
  }

  const disk = _diskMap.get(key);
  if (disk) {
    const age = Date.now() - disk.ts;
    const ttl = disk.data?.tracks?.length > 0 ? HIT_TTL_MS : MISS_TTL_MS;
    if (age < ttl) {
      g.__svSpCache.set(key, disk);
      return disk.data;
    }
    _diskMap.delete(key);
  }

  return null;
}

async function setCache(key, data) {
  const entry = { ts: Date.now(), data };
  g.__svSpCache.set(key, entry);
  _diskMap.set(key, entry);
  saveDiskCache().catch(() => {});
}

// ---------------------------------------------------------------------------
// Spotify Search
// ---------------------------------------------------------------------------
async function spotifyGet(path, token, params = {}) {
  const url = new URL(`${SPOTIFY_API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") url.searchParams.set(k, String(v));
  }
  return fetchJson(url.toString(), {
    label: "Spotify API",
    headers: { authorization: `Bearer ${token}` },
  });
}

async function searchSoundtrackSources(ctx, token, market) {
  if (isRateLimited()) {
    const secondsLeft = Math.ceil((g.__svSpRateBlock.until - Date.now()) / 1000);
    return {
      playlists: [],
      albums: [],
      query: "",
      rateLimited: true,
      retryAfter: String(secondsLeft),
    };
  }

  const queries = buildQueries(ctx);
  let allPlaylists = [];
  let allAlbums = [];
  let usedQuery = queries[0] ?? "";
  let rateLimited = false;
  let retryAfter = "";

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    let result;
    try {
      result = await spotifyGet("/search", token, {
        q,
        type: "playlist,album",
        market,
        limit: SEARCH_LIMIT,
      });
    } catch (err) {
      if (err?.status === 429) {
        retryAfter = err.retryAfter ?? "";
        setRateBlock(retryAfter);
        rateLimited = true;
        break;
      }
      if (err?.status === 401) {
        g.__svSpToken.token = "";
        g.__svSpToken.expiresAt = 0;
      }
      continue;
    }

    if (i === 0) usedQuery = q;

    const newPl = Array.isArray(result?.playlists?.items)
      ? result.playlists.items.filter(Boolean)
      : [];
    const newAl = Array.isArray(result?.albums?.items)
      ? result.albums.items.filter(Boolean)
      : [];

    allPlaylists.push(...newPl);
    allAlbums.push(...newAl);

    const goodAlbums = newAl.filter((a) => scoreAlbum(a, ctx) >= ALBUM_MIN_SCORE);
    const goodPl = newPl.filter((p) => scorePlaylist(p, ctx) >= PLAYLIST_MIN_SCORE);
    if (goodAlbums.length >= 1 || goodPl.length >= 2) break;

    if (i < queries.length - 1) await sleep(300);
  }

  const playlists = allPlaylists
    .map((p) => ({ ...p, score: scorePlaylist(p, ctx) }))
    .filter((p) => p.score >= PLAYLIST_MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i)
    .slice(0, MAX_PLAYLISTS);

  const albums = allAlbums
    .map((a) => ({ ...a, score: scoreAlbum(a, ctx) }))
    .filter((a) => a.score >= ALBUM_MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .filter((a, i, arr) => arr.findIndex((x) => x.id === a.id) === i)
    .slice(0, MAX_ALBUMS);

  return { playlists, albums, query: usedQuery, rateLimited, retryAfter };
}

// ---------------------------------------------------------------------------
// Spotify-specific scoring
// ---------------------------------------------------------------------------
function scorePlaylist(pl, ctx) {
  const name = pl?.name ?? "";
  const desc = pl?.description ?? "";
  const owner = pl?.owner?.display_name ?? "";
  const text = norm(`${name} ${desc} ${owner}`);
  let s = bestTitleScore(name, ctx.titles);

  if (ctx.originalTitle) {
    const os = titleScore(name, ctx.originalTitle);
    if (os >= 70) s += 18;
    else if (os >= 50) s += 10;
  }

  s += soundtrackBonus(text);
  if (ctx.mediaType === "tv" && /series|show|season|episode|tv|television/.test(text)) s += 8;
  if (ctx.mediaType === "movie" && /movie|film|motion picture/.test(text)) s += 8;
  if (ctx.mediaType === "tv" && /movie|film/.test(text) && !/series|show|season|episode|tv|television/.test(text)) s -= 14;
  if (ctx.mediaType === "movie" && /series|season|episode|tv|television/.test(text) && !/movie|film|motion picture/.test(text)) s -= 14;

  const total = Number(pl?.tracks?.total ?? 0);
  if (total >= 5 && total <= 120) s += 12;
  if (total > 180) s -= 14;
  if (total < 3) s -= 20;

  const nameTokenSet = new Set(tokens(name));
  const anyTitleToken = ctx.titles
    .map(sigTokens)
    .filter((ts) => ts.length)
    .some((ts) => ts.some((t) => nameTokenSet.has(t)));
  if (!anyTitleToken) s -= 50;

  return Math.round(s);
}

function scoreAlbum(album, ctx) {
  const name = album?.name ?? "";
  const artist = names(album?.artists).join(", ");
  const text = norm(`${name} ${artist}`);
  let s = bestTitleScore(name, ctx.titles);

  if (ctx.originalTitle) {
    const os = titleScore(name, ctx.originalTitle);
    if (os >= 70) s += 16;
    else if (os >= 50) s += 8;
  }

  s += soundtrackBonus(text);
  if (/motion picture|television|series|movie|film/.test(text)) s += 10;
  if (ctx.mediaType === "tv" && /movie|film|motion picture/.test(text) && !/series|television|tv/.test(text)) s -= 12;
  if (ctx.mediaType === "movie" && /series|television|tv/.test(text) && !/movie|film|motion picture/.test(text)) s -= 12;
  s += yearScore(album?.release_date, ctx.year, ctx.mediaType);

  const total = Number(album?.total_tracks ?? 0);
  if (total >= 4 && total <= 80) s += 8;
  if (total < 3) s -= 18;

  const nameTokens = new Set(tokens(album?.name ?? ""));
  const anyTitleToken = ctx.titles
    .map(sigTokens)
    .filter((ts) => ts.length)
    .some((ts) => ts.some((t) => nameTokens.has(t)));
  if (!anyTitleToken) s -= 50;

  const hasSigTokens = ctx.titles.some((t) => sigTokens(t).length > 0);
  if (bestTitleScore(album?.name ?? "", ctx.titles) === 0 && hasSigTokens) s -= 200;

  return Math.round(s);
}

// ---------------------------------------------------------------------------
// Track fetching (Spotify)
// ---------------------------------------------------------------------------
function normalizeTrack(track, src, index) {
  const artists = names(track?.artists);
  return {
    id: `spotify:${track?.id ?? `${track?.name}:${artists.join(",")}`}`,
    spotifyId: track?.id ?? "",
    trackName: track?.name ?? "",
    artistName: artists.join(", ") || "Artista desconocido",
    collectionName: src.name || track?.album?.name || "",
    previewUrl: track?.preview_url ?? "",
    artworkUrl: primaryImage(track?.album?.images) || src.artworkUrl || "",
    source: "Spotify",
    externalUrl: track?.external_urls?.spotify ?? "",
    collectionUrl: src.url ?? "",
    score: src.score + Math.max(0, src.orderBonus - index * src.indexPenalty),
  };
}

async function playlistTracks(pl, token, market) {
  const data = await spotifyGet(`/playlists/${pl.id}/tracks`, token, {
    market,
    limit: 80,
    fields:
      "items(track(id,name,preview_url,external_urls,album(name,images),artists(name),type)),total",
  });
  const src = {
    name: pl.name,
    url: pl.external_urls?.spotify ?? "",
    artworkUrl: primaryImage(pl.images),
    score: pl.score,
    orderBonus: 24,
    indexPenalty: 0.4,
  };
  return (Array.isArray(data?.items) ? data.items : [])
    .map((item) => item?.track)
    .filter((t) => t?.type === "track" && t?.name)
    .map((t, i) => normalizeTrack(t, src, i));
}

async function albumTracks(album, token, market) {
  const data = await spotifyGet(`/albums/${album.id}/tracks`, token, {
    market,
    limit: 80,
  });
  const src = {
    name: album.name,
    url: album.external_urls?.spotify ?? "",
    artworkUrl: primaryImage(album.images),
    score: album.score,
    orderBonus: 18,
    indexPenalty: 0.3,
  };
  return (Array.isArray(data?.items) ? data.items : [])
    .filter((t) => t?.type === "track" && t?.name)
    .map((t, i) => normalizeTrack(t, src, i));
}

function dedupe(tracks) {
  const map = new Map();
  for (const t of tracks) {
    const sem = `${norm(t.trackName)}:${norm(t.artistName)}`;
    const key = t.spotifyId || sem;
    const prev = map.get(key);
    if (!prev || (t.score ?? -1) > (prev.score ?? -1)) map.set(key, t);
  }
  return [...map.values()];
}

function toPublic(t) {
  return {
    id: t.id,
    spotifyId: t.spotifyId ?? "",
    trackName: t.trackName,
    artistName: t.artistName,
    collectionName: t.collectionName,
    previewUrl: t.previewUrl,
    artworkUrl: t.artworkUrl,
    source: t.source,
    externalUrl: t.externalUrl,
    collectionUrl: t.collectionUrl,
  };
}

function matchTrack(a, b) {
  return (
    norm(a.trackName) === norm(b.trackName) &&
    norm(a.artistName) === norm(b.artistName)
  );
}

// ---------------------------------------------------------------------------
// Main loader (cache → search → fetch tracks)
// ---------------------------------------------------------------------------
async function loadSoundtrack(ctx, token, markets) {
  const market = markets[0] ?? "US";
  const cacheKey = getCacheKey(ctx, market);

  const cached = await getCached(cacheKey);
  if (cached) return { ...cached, fromCache: true };

  let sources = await searchSoundtrackSources(ctx, token, market);

  if (
    !sources.playlists.length &&
    !sources.albums.length &&
    markets[1] &&
    !sources.rateLimited
  ) {
    await sleep(400);
    sources = await searchSoundtrackSources(ctx, token, markets[1]);
  }

  if (sources.rateLimited && !sources.playlists.length && !sources.albums.length) {
    const result = { ...sources, tracks: [], market };
    await setCache(cacheKey, result);
    return result;
  }

  const trackResults = await Promise.allSettled([
    ...sources.playlists.map((pl) => playlistTracks(pl, token, market)),
    ...sources.albums.map((al) => albumTracks(al, token, market)),
  ]);

  const tracks = trackResults.flatMap((r) =>
    r.status === "fulfilled" ? r.value : [],
  );

  const result = { ...sources, tracks, market };
  await setCache(cacheKey, result);
  return result;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function GET(req) {
  const sp = new URL(req.url).searchParams;

  const title = String(sp.get("title") ?? "").trim();
  const originalTitle = String(sp.get("originalTitle") ?? "").trim();
  const mediaType = sp.get("type") === "tv" ? "tv" : "movie";
  const year = getYear(sp.get("year"));
  const country = String(sp.get("country") ?? "US").toUpperCase();
  const debug =
    process.env.NODE_ENV !== "production" && sp.get("debug") === "1";

  if (!title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }

  const titles = unique([originalTitle, title]);
  const ctx = { titles, originalTitle, year, mediaType };
  const configured = Boolean(credentials());

  // ---- Try to get Spotify auth ----
  let auth = { token: "", mode: "missing_credentials" };
  if (configured) {
    try {
      auth = await getToken();
    } catch {
      auth = { token: "", mode: "auth_failed" };
    }
  }

  // ---- State variables ----
  let result = null;
  let tracks = [];
  let spotifyActive = false;
  let spotifyRateLimited = false;
  let spotifyRetryAfter = "";
  let fromCache = false;
  let spotifyPlaylists = [];
  let spotifyAlbums = [];
  let spotifyQuery = "";
  let market = country;

  // ---- Try Spotify ----
  if (auth.token) {
    try {
      result = await loadSoundtrack(ctx, auth.token, unique([country, "US"]));
      spotifyActive = true;
      fromCache = Boolean(result.fromCache);
      market = result.market ?? country;

      if (result.rateLimited) {
        spotifyRateLimited = true;
        spotifyRetryAfter = result.retryAfter ?? "";
      }

      spotifyQuery = result.query ?? "";
      spotifyPlaylists = Array.isArray(result.playlists) ? result.playlists : [];
      spotifyAlbums = Array.isArray(result.albums) ? result.albums : [];

      const spotifyTracks = Array.isArray(result.tracks) ? result.tracks : [];
      tracks = dedupe(spotifyTracks)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, MAX_TRACKS)
        .map(toPublic);
    } catch (err) {
      console.error("[Spotify] search error:", err?.message);
    }
  }

  // ---- Try fallback if Spotify didn't return enough tracks ----
  let fallbackSource = null;
  let fallbackActive = false;
  const needsFallback =
    tracks.length < 3 ||
    spotifyRateLimited ||
    !spotifyActive ||
    (!configured && tracks.length === 0);

  if (needsFallback) {
    try {
      const fallback = await searchFallback(ctx, country);

      if (Array.isArray(fallback.tracks) && fallback.tracks.length > 0) {
        if (tracks.length === 0) {
          tracks = fallback.tracks;
        } else {
          for (const ft of fallback.tracks) {
            if (!tracks.some((t) => matchTrack(t, ft))) {
              tracks.push(ft);
            }
          }
        }

        fallbackSource = fallback.source;
        fallbackActive = true;

        if (!spotifyActive || tracks.every((t) => t.source !== "Spotify")) {
          spotifyQuery = fallback.query || spotifyQuery;
        }
      }
    } catch (err) {
      console.error("[Fallback] search error:", err?.message);
    }
  }

  // ---- Build response payload ----
  const payload = {
    source: tracks.some((t) => t.source === "Spotify") ? "spotify" : (fallbackSource?.toLowerCase() ?? "spotify"),
    query: spotifyQuery || "",
    market,
    spotifyConfigured: configured,
    spotifyActive,
    spotifyRateLimited,
    spotifyRetryAfter,
    spotifyAuthMode: auth.mode,
    fromCache,
    fallbackSource,
    fallbackActive,
    spotifyPlaylists: spotifyPlaylists.map((p) => ({
      id: p.id,
      name: p.name,
      owner: p.owner?.display_name ?? "",
      total: Number(p.tracks?.total ?? 0),
      score: p.score,
      url: p.external_urls?.spotify ?? "",
    })),
    albums: spotifyAlbums.map((a) => ({
      id: String(a.id),
      name: a.name,
      artist: names(a.artists).join(", "),
      score: a.score,
      releaseDate: a.release_date ?? null,
      url: a.external_urls?.spotify ?? "",
    })),
    tracks,
  };

  if (debug && result) {
    payload.debug = {
      queries: buildQueries(ctx),
      rateLimitBlockUntil: g.__svSpRateBlock.until
        ? new Date(g.__svSpRateBlock.until).toISOString()
        : null,
      playlistScores: spotifyPlaylists.map((p) => ({
        name: p.name,
        score: p.score,
      })),
      albumScores: spotifyAlbums.map((a) => ({
        name: a.name,
        score: a.score,
      })),
    };
  }

  return NextResponse.json(payload, {
    headers: {
      "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
