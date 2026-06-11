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
  containsAny, names, primaryImage, sleep, titleScore, bestTitleScore,
  yearScore, soundtrackBonus, SOUNDTRACK_WORDS, BAD_MATCH_WORDS,
} from "@/lib/api/soundtrack-utils";
import { searchFallback } from "@/lib/api/soundtrack-fallback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Spotify preview URL resolver (embed workaround)
// ---------------------------------------------------------------------------
const PREVIEW_CACHE_MAX = 2000;
const previewCache = new Map();

async function resolvePreviewUrl(spotifyId, token) {
  if (!spotifyId) return "";
  const cached = previewCache.get(spotifyId);
  if (cached) return cached;

  let url = "";

  // Try 1: Single-track API endpoint (sometimes has preview_url when album endpoint doesn't)
  if (token && !url) {
    try {
      const data = await spotifyGet(`/tracks/${spotifyId}`, token, {});
      if (data?.preview_url) url = data.preview_url;
    } catch { /* skip */ }
  }

  // Try 2: Scrape embed page for audioPreview
  if (!url) {
    try {
      const res = await fetch(`https://open.spotify.com/embed/track/${spotifyId}`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const html = await res.text();
        const match = html.match(/"audioPreview":\{"url":"([^"]+)"/);
        if (match) url = match[1].replace(/\\u002F/g, "/");
      }
    } catch { /* skip */ }
  }

  if (previewCache.size >= PREVIEW_CACHE_MAX) {
    const firstKey = previewCache.keys().next().value;
    if (firstKey) previewCache.delete(firstKey);
  }
  previewCache.set(spotifyId, url);
  return url;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

const REQUEST_TIMEOUT_MS = 9000;
const MAX_TRACKS = 40;
const SOUNDTRACK_ALBUM_RESERVE_TRACKS = 30;
const SCORE_ALBUM_RESERVE_TRACKS = 10;
const PRIMARY_COLLECTION_SOFT_LIMIT = 30;
const MAX_SPOTIFY_ALBUMS = 5;
const MAX_SPOTIFY_PLAYLISTS = 3;
const SPOTIFY_PREVIEW_RESOLVE_LIMIT = 12;
const SEARCH_LIMIT = 10;
const ALBUM_MIN_SCORE = 32;
const PLAYLIST_MIN_SCORE = 48;
const MIN_PREVIEW_TRACKS_BEFORE_FALLBACK = 8;
const CACHE_VERSION = "soundtrack-ranking-v11";

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
    } catch (e) {
      console.warn("[Spotify] refresh_token failed:", e?.message);
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
// Query construction
// ---------------------------------------------------------------------------
function buildQueries(ctx) {
  const qs = [];
  const titleList = unique([ctx.originalTitle, ...(ctx.titles || [])]);

  for (const title of titleList) {
    const short = norm(title).replace(/\s+/g, "").length <= 3;

    if (!short) {
      qs.push(`"${title}" soundtrack`);
      qs.push(`"${title}" OST`);
    }

    qs.push(`${title} soundtrack`);
    qs.push(`${title} OST`);

    if (ctx.mediaType === "tv") {
      qs.push(`${title} series soundtrack`);
      qs.push(`${title} television soundtrack`);
    } else {
      qs.push(`${title} movie soundtrack`);
      qs.push(`${title} motion picture soundtrack`);
    }

    if (short && ctx.mediaType === "movie") {
      qs.push(`${title} the movie`);
      qs.push(`${title} the album`);
    }

    if (ctx.year) {
      if (!short) qs.push(`"${title}" ${ctx.year} soundtrack`);
      qs.push(`${title} ${ctx.year} soundtrack`);
      qs.push(`${title} ${ctx.year}`);
    }

    if (!short) qs.push(`"${title}"`);
    qs.push(title);
  }

  return unique(qs).slice(0, 10);
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
  return `${CACHE_VERSION}|${norm(ctx.titles.join("|"))}|${ctx.mediaType}|${ctx.year ?? ""}|${market}`;
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
      albums: [],
      playlists: [],
      query: "",
      rateLimited: true,
      retryAfter: String(secondsLeft),
    };
  }

  const queries = buildQueries(ctx);
  let allAlbums = [];
  let allPlaylists = [];
  let usedQuery = queries[0] ?? "";
  let rateLimited = false;
  let retryAfter = "";

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    let result;
    try {
      result = await spotifyGet("/search", token, {
        q, type: "album,playlist", market, limit: SEARCH_LIMIT,
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

    const newAl = Array.isArray(result?.albums?.items)
      ? result.albums.items.filter(Boolean)
      : [];
    const newPl = Array.isArray(result?.playlists?.items)
      ? result.playlists.items.filter(Boolean)
      : [];
    allAlbums.push(...newAl);
    allPlaylists.push(...newPl);

    const goodAlbumIds = new Set(
      allAlbums
        .map((a) => ({ id: a.id, score: scoreAlbum(a, ctx) }))
        .filter((a) => a.id && a.score >= ALBUM_MIN_SCORE)
        .map((a) => a.id),
    );
    const goodPlaylistIds = new Set(
      allPlaylists
        .map((p) => ({ id: p.id, score: scorePlaylist(p, ctx) }))
        .filter((p) => p.id && p.score >= PLAYLIST_MIN_SCORE)
        .map((p) => p.id),
    );
    if (
      goodPlaylistIds.size >= MAX_SPOTIFY_PLAYLISTS ||
      goodAlbumIds.size >= MAX_SPOTIFY_ALBUMS ||
      (i >= 1 && goodPlaylistIds.size >= 1 && goodAlbumIds.size >= 1) ||
      (i >= 1 && goodAlbumIds.size >= 3)
    ) {
      break;
    }

    if (i < queries.length - 1) await sleep(80);
  }

  const uniqueAlbums = allAlbums
    .map((a) => ({ ...a, score: scoreAlbum(a, ctx) }))
    .filter((a) => a.score >= ALBUM_MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .filter((a, i, arr) => arr.findIndex((x) => x.id === a.id) === i)
    .slice(0, MAX_SPOTIFY_ALBUMS);

  const uniquePlaylists = allPlaylists
    .map((p) => ({ ...p, score: scorePlaylist(p, ctx) }))
    .filter((p) => p.score >= PLAYLIST_MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i)
    .slice(0, MAX_SPOTIFY_PLAYLISTS);

  return {
    albums: uniqueAlbums,
    playlists: uniquePlaylists,
    query: usedQuery,
    rateLimited,
    retryAfter,
  };
}

// ---------------------------------------------------------------------------
// Spotify-specific scoring
// ---------------------------------------------------------------------------
const COMPILATION_WORD_RE =
  /\b(compilation|collection|best of|greatest hits|movie hits|movies compilation|film themes|movie themes|various movies|various artists)\b/;

function titleFitStats(text, ctx) {
  const textTokens = tokens(text);
  const textSig = sigTokens(text);
  const textSet = new Set(textTokens);
  let best = {
    score: 0,
    hits: 0,
    ratio: 0,
    phrase: false,
    textSigCount: textSig.length,
  };

  for (const title of ctx.titles) {
    const titleTokens = tokens(title);
    const titleSig = sigTokens(title);
    if (!titleTokens.length || !titleSig.length) continue;

    const phrase = textTokens.some((_, i) =>
      titleTokens.every((token, j) => textTokens[i + j] === token),
    );
    const hits = titleSig.filter((token) => textSet.has(token)).length;
    const ratio = hits / titleSig.length;
    const score = (phrase ? 100 : 0) + ratio * 70 - Math.max(0, textSig.length - hits) * 2;

    if (score > best.score) {
      best = { score, hits, ratio, phrase, textSigCount: textSig.length };
    }
  }

  return best;
}

function titleFitBonus(name, ctx, strongSoundtrackContext) {
  const stats = titleFitStats(name, ctx);
  if (!stats.score) return -200;

  const extraTokens = Math.max(0, stats.textSigCount - stats.hits);
  let score = 0;

  if (stats.phrase && extraTokens <= 4) score += 36;
  else if (stats.phrase) score += 16;
  if (stats.ratio >= 1) score += 14;

  if (extraTokens > 4 && !strongSoundtrackContext) {
    score -= Math.min(150, (extraTokens - 4) * 16);
  }
  if (extraTokens > 8) {
    score -= Math.min(90, (extraTokens - 8) * 9);
  }

  return score;
}

function collectionNoisePenalty(text, strongSoundtrackContext) {
  let score = 0;
  if (COMPILATION_WORD_RE.test(text) && !strongSoundtrackContext) score -= 95;
  if (/karaoke|tribute|cover|covers|made famous by|as made famous/.test(text)) score -= 120;
  if (/unofficial|performed by|popcorn buckets|the hit co|tribute co/.test(text)) score -= 220;
  if (/from\s+["']?[^"']+["']?/.test(text) && !strongSoundtrackContext) score -= 25;
  return score;
}

function scoreAlbum(album, ctx) {
  const name = album?.name ?? "";
  const artist = names(album?.artists).join(", ");
  const text = norm(`${name} ${artist}`);
  let s = bestTitleScore(name, ctx.titles);
  const hasShortTitle = ctx.titles.some(
    (title) => norm(title).replace(/\s+/g, "").length <= 3,
  );
  const hasSoundtrackContext =
    containsAny(text, SOUNDTRACK_WORDS) ||
    /album|motion picture|television|series|movie|film|score|ost/.test(text);
  const strongSoundtrackContext =
    containsAny(text, SOUNDTRACK_WORDS) ||
    /official|original motion picture|original soundtrack|music from/.test(text);

  if (ctx.originalTitle) {
    const os = titleScore(name, ctx.originalTitle);
    if (os >= 70) s += 16;
    else if (os >= 50) s += 8;
  }

  s += titleFitBonus(name, ctx, strongSoundtrackContext);
  s += collectionNoisePenalty(text, strongSoundtrackContext);
  s += soundtrackBonus(text);
  if (containsAny(text, BAD_MATCH_WORDS)) s -= 80;
  if (/unofficial|performed by/.test(text)) s -= 220;
  if (/popcorn buckets|the hit co|tribute co|soundtrack orchestra|soundtrack hit lab/.test(text)) s -= 140;
  if (/official/.test(text)) s += 22;
  if (/original soundtrack|original motion picture/.test(text)) s += 24;
  if (/the soundtrack/.test(text) && !/unofficial|performed by/.test(text)) s += 65;
  if (/motion picture|television|series|movie|film/.test(text)) s += 10;
  if (hasShortTitle && !hasSoundtrackContext) s -= 100;
  if (ctx.mediaType === "movie" && /game|video game|manager|simulator/.test(text) && !/movie|film|motion picture/.test(text)) s -= 120;
  if (ctx.mediaType === "tv" && /movie|film|motion picture/.test(text) && !/series|television|tv/.test(text)) s -= 12;
  if (ctx.mediaType === "movie" && /series|television|tv/.test(text) && !/movie|film|motion picture/.test(text)) s -= 12;
  s += yearScore(album?.release_date, ctx.year, ctx.mediaType);

  const total = Number(album?.total_tracks ?? 0);
  if (total >= 4 && total <= 80) s += 8;
  if (total < 3) s -= 100;

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

function scorePlaylist(playlist, ctx) {
  const name = playlist?.name ?? "";
  const desc = playlist?.description ?? "";
  const owner = playlist?.owner?.display_name ?? "";
  const text = norm(`${name} ${desc} ${owner}`);
  const strongSoundtrackContext =
    containsAny(text, SOUNDTRACK_WORDS) ||
    /official|original motion picture|original soundtrack|music from|ost/.test(text);
  let s = bestTitleScore(name, ctx.titles);

  if (ctx.originalTitle) {
    const os = titleScore(name, ctx.originalTitle);
    if (os >= 70) s += 16;
    else if (os >= 50) s += 8;
  }

  s += titleFitBonus(name, ctx, strongSoundtrackContext);
  s += collectionNoisePenalty(text, strongSoundtrackContext);
  s += soundtrackBonus(text);

  if (/official/.test(text)) s += 55;
  if (/original soundtrack|original motion picture/.test(text)) s += 26;
  if (ctx.mediaType === "tv" && /series|show|season|episode|tv|television/.test(text)) s += 10;
  if (ctx.mediaType === "movie" && /movie|film|motion picture/.test(text)) s += 10;
  if (ctx.mediaType === "tv" && /movie|film/.test(text) && !/series|show|season|episode|tv|television/.test(text)) s -= 14;
  if (ctx.mediaType === "movie" && /series|season|episode|tv|television/.test(text) && !/movie|film|motion picture/.test(text)) s -= 14;

  const total = Number(playlist?.tracks?.total ?? 0);
  if (total > 0) {
    if (total >= 6 && total <= 45) s += 18;
    else if (total >= 3 && total <= 80) s += 10;
    if (total > 120) s -= 45;
    if (total < 3) s -= 80;
  }

  const nameTokens = new Set(tokens(name));
  const anyTitleToken = ctx.titles
    .map(sigTokens)
    .filter((ts) => ts.length)
    .some((ts) => ts.some((t) => nameTokens.has(t)));
  if (!anyTitleToken) s -= 70;

  const hasSigTokens = ctx.titles.some((t) => sigTokens(t).length > 0);
  if (bestTitleScore(name, ctx.titles) === 0 && hasSigTokens) s -= 220;

  return Math.round(s);
}

// ---------------------------------------------------------------------------
// Track fetching (Spotify)
// ---------------------------------------------------------------------------
function normalizeTrack(track, src, index) {
  const artists = names(track?.artists);
  const spotifyId = track?.id ?? "";
  return {
    id: `spotify:${spotifyId || `${track?.name}:${artists.join(",")}`}`,
    spotifyId,
    trackName: track?.name ?? "",
    artistName: artists.join(", ") || "Artista desconocido",
    collectionName: src.name || track?.album?.name || "",
    previewUrl: track?.preview_url ?? "",
    embedUrl: spotifyId ? `https://open.spotify.com/embed/track/${spotifyId}` : "",
    artworkUrl: primaryImage(track?.album?.images) || src.artworkUrl || "",
    source: "Spotify",
    externalUrl: track?.external_urls?.spotify ?? "",
    collectionUrl: src.url ?? "",
    albumScore: src.score,
    albumIndex: src.albumIndex ?? 0,
    trackIndex: index,
    popularity: Number(track?.popularity ?? 0),
    score:
      src.score +
      Math.max(0, src.orderBonus - index * src.indexPenalty) +
      Number(track?.popularity ?? 0) * 0.35,
  };
}

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&quot;/g, "\"")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function playlistEmbedTracks(playlist) {
  const res = await fetch(`https://open.spotify.com/embed/playlist/${playlist.id}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) return [];

  const html = await res.text();
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!match?.[1]) return [];

  let data;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return [];
  }

  const entity = data?.props?.pageProps?.state?.data?.entity;
  const trackList = Array.isArray(entity?.trackList) ? entity.trackList : [];
  const cover = entity?.coverArt?.sources?.[0]?.url || primaryImage(playlist.images);
  const src = {
    name: entity?.title || playlist.name,
    url: playlist.external_urls?.spotify ?? "",
    artworkUrl: cover,
    score: playlist.score,
    albumIndex: playlist.albumIndex ?? 0,
    orderBonus: 38,
    indexPenalty: 0.55,
  };

  return trackList
    .filter((track) => track?.entityType === "track" && track?.title)
    .slice(0, MAX_TRACKS)
    .map((track, index) => {
      const spotifyId = String(track.uri || "").replace("spotify:track:", "");
      return normalizeTrack(
        {
          id: spotifyId,
          name: decodeHtml(track.title),
          preview_url: track.audioPreview?.url ?? "",
          external_urls: spotifyId
            ? { spotify: `https://open.spotify.com/track/${spotifyId}` }
            : {},
          album: {
            name: src.name,
            images: cover ? [{ url: cover }] : [],
          },
          artists: [{ name: decodeHtml(track.subtitle) }],
          type: "track",
          popularity: 0,
        },
        src,
        index,
      );
    });
}

async function albumEmbedTracks(album) {
  const res = await fetch(`https://open.spotify.com/embed/album/${album.id}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) return [];

  const html = await res.text();
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!match?.[1]) return [];

  let data;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return [];
  }

  const entity = data?.props?.pageProps?.state?.data?.entity;
  const trackList = Array.isArray(entity?.trackList) ? entity.trackList : [];
  const cover = entity?.coverArt?.sources?.[0]?.url || primaryImage(album.images);
  const src = {
    name: entity?.title || album.name,
    url: album.external_urls?.spotify ?? "",
    artworkUrl: cover,
    score: album.score,
    albumIndex: album.albumIndex ?? 0,
    orderBonus: 22,
    indexPenalty: 0.3,
  };

  return trackList
    .filter((track) => track?.entityType === "track" && track?.title)
    .slice(0, MAX_TRACKS)
    .map((track, index) => {
      const spotifyId = String(track.uri || "").replace("spotify:track:", "");
      return normalizeTrack(
        {
          id: spotifyId,
          name: decodeHtml(track.title),
          preview_url: track.audioPreview?.url ?? "",
          external_urls: spotifyId
            ? { spotify: `https://open.spotify.com/track/${spotifyId}` }
            : {},
          album: {
            name: src.name,
            images: cover ? [{ url: cover }] : [],
          },
          artists: [{ name: decodeHtml(track.subtitle) }],
          type: "track",
          popularity: 0,
        },
        src,
        index,
      );
    });
}

async function playlistTracks(playlist, token, market) {
  const src = {
    name: playlist.name,
    url: playlist.external_urls?.spotify ?? "",
    artworkUrl: primaryImage(playlist.images),
    score: playlist.score,
    albumIndex: playlist.albumIndex ?? 0,
    orderBonus: 34,
    indexPenalty: 0.7,
  };

  let data;
  try {
    data = await spotifyGet(`/playlists/${playlist.id}/tracks`, token, {
      market,
      limit: MAX_TRACKS,
      fields:
        "items(track(id,name,popularity,preview_url,external_urls,album(name,images),artists(name),type)),total",
    });
  } catch (err) {
    if (err?.status === 429) throw err;
    const embedTracks = await playlistEmbedTracks(playlist);
    if (embedTracks.length) return embedTracks;
    throw err;
  }

  return (Array.isArray(data?.items) ? data.items : [])
    .map((item) => item?.track)
    .filter((t) => t?.type === "track" && t?.name)
    .map((t, i) => normalizeTrack(t, src, i));
}

async function albumTracks(album, token, market) {
  const src = {
    name: album.name,
    url: album.external_urls?.spotify ?? "",
    artworkUrl: primaryImage(album.images),
    score: album.score,
    albumIndex: album.albumIndex ?? 0,
    orderBonus: 18,
    indexPenalty: 0.3,
  };

  const items = [];
  let offset = 0;

  while (items.length < MAX_TRACKS) {
    const data = await spotifyGet(`/albums/${album.id}/tracks`, token, {
      market,
      limit: Math.min(50, MAX_TRACKS - items.length),
      offset,
    });
    const pageItems = Array.isArray(data?.items) ? data.items : [];
    items.push(...pageItems);

    if (!data?.next || pageItems.length === 0) break;
    offset += pageItems.length;
  }

  const normalized = items
    .filter((t) => t?.type === "track" && t?.name)
    .map((t, i) => normalizeTrack(t, src, i));

  const previewCount = normalized.filter((track) => track.previewUrl).length;
  if (normalized.length > 0 && previewCount < Math.min(3, normalized.length)) {
    const embedTracks = await albumEmbedTracks(album);
    if (embedTracks.length > 0) {
      return dedupeTracks([...normalized, ...embedTracks]);
    }
  }

  return normalized;
}

function artistTokens(value) {
  return new Set(norm(value).split(" ").filter((token) => token.length > 2));
}

function hasArtistOverlap(a, b) {
  const left = artistTokens(a);
  const right = artistTokens(b);
  if (!left.size || !right.size) return true;
  for (const token of right) {
    if (left.has(token)) return true;
  }
  return false;
}

function dedupeTracks(tracks) {
  const merged = [];

  for (const track of tracks) {
    const existingIndex = merged.findIndex((item) => matchTrack(item, track));
    if (existingIndex === -1) {
      merged.push(track);
      continue;
    }

    const existing = merged[existingIndex];
    const candidateIsScoreAlbum = isOfficialScoreAlbumTrack(track);
    const existingIsScoreAlbum = isOfficialScoreAlbumTrack(existing);
    const candidateHasPreview = Boolean(track.previewUrl);
    const existingHasPreview = Boolean(existing.previewUrl);
    if (
      (candidateIsScoreAlbum && !existingIsScoreAlbum) ||
      (candidateHasPreview && !existingHasPreview) ||
      (trackPriority(track) > trackPriority(existing) &&
        candidateHasPreview === existingHasPreview &&
        candidateIsScoreAlbum === existingIsScoreAlbum)
    ) {
      merged[existingIndex] = { ...existing, ...track };
    } else if (!existing.previewUrl && track.previewUrl) {
      merged[existingIndex] = { ...existing, previewUrl: track.previewUrl };
    }
  }

  return merged;
}

function toPublic(t) {
  return {
    id: t.id,
    spotifyId: t.spotifyId ?? "",
    trackName: t.trackName,
    artistName: t.artistName,
    collectionName: t.collectionName,
    previewUrl: t.previewUrl,
    embedUrl: t.embedUrl ?? "",
    artworkUrl: t.artworkUrl,
    source: t.source,
    externalUrl: t.externalUrl,
    collectionUrl: t.collectionUrl,
  };
}

function matchTrack(a, b) {
  const aName = norm(a.trackName);
  const bName = norm(b.trackName);
  if (!aName || aName !== bName) return false;
  return hasArtistOverlap(a.artistName, b.artistName);
}

function sourcePriority(source) {
  if (source === "Spotify") return 7;
  if (source === "iTunes") return 5;
  if (source === "Deezer") return 4;
  return 0;
}

function collectionTier(collection) {
  if (containsAny(collection, BAD_MATCH_WORDS)) return -2;
  if (/single|ep/.test(collection)) return -1;
  if (/official/.test(collection) && /soundtrack|ost/.test(collection)) return 6;
  if (/the album/.test(collection)) return 5;
  if (/soundtrack|music from|inspired by/.test(collection)) return 4;
  if (/score/.test(collection)) return 3;
  if (/ost|album/.test(collection)) return 2;
  return 0;
}

function trackPriority(track) {
  const collection = norm(track.collectionName);
  const name = norm(track.trackName);
  let score = collectionTier(collection) * 1000 + Number(track.score ?? 0);

  if (track.previewUrl) score += 120;
  score += sourcePriority(track.source);
  score += Number(track.popularity ?? 0) * 0.45;

  if (/official/.test(collection)) score += 55;
  if (/the album/.test(collection)) score += 70;
  if (/soundtrack/.test(collection)) score += 45;
  if (/music from|inspired by/.test(collection)) score += 35;
  if (/score/.test(collection)) score += 20;
  if (/original|official/.test(collection)) score += 10;
  if (/motion picture|movie|film|television|series/.test(collection)) score += 10;
  if (/ost|album/.test(collection)) score += 8;
  if (/main theme|theme/.test(name)) score += 5;
  if (containsAny(collection, BAD_MATCH_WORDS)) score -= 90;
  if (/single|ep/.test(collection)) score -= 35;
  if (/game|video game|manager|simulator/.test(collection) && !/movie|film|motion picture/.test(collection)) {
    score -= 80;
  }

  score -= Number(track.albumIndex ?? 0) * 3;
  score -= Number(track.trackIndex ?? 0) * 0.05;
  return score;
}

function trackStableKey(track) {
  return track.id || `${norm(track.trackName)}:${norm(track.artistName)}`;
}

function collectionKey(track) {
  return `${track.source || ""}:${norm(track.collectionName)}`;
}

function isAlbumCollection(track) {
  return /\/album\//.test(String(track.collectionUrl || ""));
}

function isOfficialScoreAlbumTrack(track) {
  const collection = norm(track.collectionName);
  return (
    isAlbumCollection(track) &&
    /score|original score/.test(collection) &&
    !containsAny(collection, BAD_MATCH_WORDS)
  );
}

function isCanonicalSoundtrackAlbumTrack(track) {
  const collection = norm(track.collectionName);
  return (
    isAlbumCollection(track) &&
    !isOfficialScoreAlbumTrack(track) &&
    !containsAny(collection, BAD_MATCH_WORDS) &&
    (
      /the soundtrack/.test(collection) ||
      /original motion picture soundtrack/.test(collection) ||
      /music from .*motion picture/.test(collection)
    )
  );
}

function topRelevantTracks(tracks) {
  const deduped = dedupeTracks(tracks);
  const playable = deduped.filter((track) => track.previewUrl);
  const candidates = playable.length ? playable : deduped;

  const sorted = candidates.sort((a, b) => {
      const priorityDelta = trackPriority(b) - trackPriority(a);
      if (priorityDelta) return priorityDelta;
      return norm(a.trackName).localeCompare(norm(b.trackName));
    });

  const selected = [];
  const selectedKeys = new Set();
  const collectionCounts = new Map();
  const addTrack = (track) => {
    const key = trackStableKey(track);
    if (selectedKeys.has(key) || selected.length >= MAX_TRACKS) return false;
    selected.push(track);
    selectedKeys.add(key);
    const cKey = collectionKey(track);
    collectionCounts.set(cKey, (collectionCounts.get(cKey) || 0) + 1);
    return true;
  };

  const scoreAlbumTracks = sorted.filter(isOfficialScoreAlbumTrack);
  const soundtrackAlbumTracks = sorted.filter(isCanonicalSoundtrackAlbumTrack);
  const soundtrackReserve = scoreAlbumTracks.length
    ? SOUNDTRACK_ALBUM_RESERVE_TRACKS
    : MAX_TRACKS;

  for (const track of soundtrackAlbumTracks.slice(0, soundtrackReserve)) {
    addTrack(track);
  }
  for (const track of scoreAlbumTracks.slice(0, SCORE_ALBUM_RESERVE_TRACKS)) {
    addTrack(track);
  }

  for (const track of sorted) {
    const cKey = collectionKey(track);
    if (
      (scoreAlbumTracks.length > 0 || soundtrackAlbumTracks.length > 0) &&
      (collectionCounts.get(cKey) || 0) >= PRIMARY_COLLECTION_SOFT_LIMIT
    ) {
      continue;
    }
    addTrack(track);
  }

  for (const track of sorted) {
    if (selected.length >= MAX_TRACKS) break;
    addTrack(track);
  }

  return selected.sort((a, b) => {
    const priorityDelta = trackPriority(b) - trackPriority(a);
    if (priorityDelta) return priorityDelta;
    return norm(a.trackName).localeCompare(norm(b.trackName));
  });
}

function hasEnoughPreviewTracks(tracks) {
  const playableCount = tracks.filter((track) => track.previewUrl).length;
  return playableCount >= Math.min(MIN_PREVIEW_TRACKS_BEFORE_FALLBACK, MAX_TRACKS);
}

// ---------------------------------------------------------------------------
// Main loader (cache → search → fetch tracks)
// ---------------------------------------------------------------------------
async function loadSoundtrack(ctx, token, markets) {
  let market = markets[0] ?? "US";
  const cacheKey = getCacheKey(ctx, market);

  const cached = await getCached(cacheKey);
  if (cached) return { ...cached, fromCache: true };

  let sources = await searchSoundtrackSources(ctx, token, market);

  if (
    !sources.albums.length &&
    !sources.playlists?.length &&
    markets[1] &&
    !sources.rateLimited
  ) {
    await sleep(400);
    market = markets[1];
    sources = await searchSoundtrackSources(ctx, token, market);
  }

  if (sources.rateLimited && !sources.albums.length && !sources.playlists?.length) {
    const result = { ...sources, tracks: [], market };
    await setCache(cacheKey, result);
    return result;
  }

  const albums = Array.isArray(sources.albums) ? sources.albums : [];
  const playlists = Array.isArray(sources.playlists) ? sources.playlists : [];
  if (!albums.length && !playlists.length) {
    const result = { ...sources, tracks: [], market };
    await setCache(cacheKey, result);
    return result;
  }

  console.log(
    `[Spotify] selected playlists: ${playlists
      .map((playlist) => `"${playlist.name}"`)
      .join(", ") || "none"}`,
  );
  console.log(
    `[Spotify] selected albums: ${albums
      .map((album) => `"${album.name}"`)
      .join(", ") || "none"}`,
  );

  const trackResults = await Promise.allSettled(
    [
      ...playlists.map((playlist, albumIndex) =>
        playlistTracks({ ...playlist, albumIndex }, token, market),
      ),
      ...albums.map((album, albumIndex) =>
        albumTracks({ ...album, albumIndex: albumIndex + playlists.length }, token, market),
      ),
    ],
  );
  for (const result of trackResults) {
    if (result.status === "rejected") {
      console.warn("[Spotify] source tracks rejected:", result.reason?.message);
    }
  }

  let tracks = dedupeTracks(
    trackResults.flatMap((result) =>
      result.status === "fulfilled" ? result.value : [],
    ),
  );

  console.log(
    `[Spotify] got ${tracks.length} tracks from sources, ${tracks.filter((t) => t.previewUrl).length} with preview`,
  );

  const needPreview = tracks
    .filter((t) => !t.previewUrl && t.spotifyId)
    .slice(0, SPOTIFY_PREVIEW_RESOLVE_LIMIT);
  if (needPreview.length > 0) {
    console.log(`[Spotify] resolving ${needPreview.length} preview URLs...`);
    const resolved = await Promise.allSettled(
      needPreview.map(async (t) => {
        const url = await resolvePreviewUrl(t.spotifyId, token);
        if (url) t.previewUrl = url;
      }),
    );
    console.log(
      `[Spotify] preview resolution done: ${tracks.filter((t) => t.previewUrl).length} with preview now`,
    );
    for (const r of resolved) {
      if (r.status === "rejected") {
        console.warn("[Spotify] preview resolve rejected:", r.reason?.message);
      }
    }
  }

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
    } catch (e) {
      console.error("[Spotify] getToken error:", e?.message);
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
      tracks = spotifyTracks;
    } catch (err) {
      console.error("[Spotify] search error:", err?.message);
    }
  }

  // ---- Fallback: enrich Spotify tracks with preview URLs & add missing tracks ----
  let fallbackSource = null;
  let fallbackActive = false;

  const needsFallback =
    tracks.length === 0 ||
    spotifyRateLimited ||
    !spotifyActive ||
    !hasEnoughPreviewTracks(tracks);

  if (needsFallback) {
    try {
      const fallback = await searchFallback(ctx, country);

      if (Array.isArray(fallback.tracks) && fallback.tracks.length > 0) {
        if (tracks.length === 0) {
          tracks = fallback.tracks;
        } else {
          for (const ft of fallback.tracks) {
            const matchIdx = tracks.findIndex((t) => matchTrack(t, ft));
            if (matchIdx !== -1) {
              if (!tracks[matchIdx].previewUrl && ft.previewUrl) {
                tracks[matchIdx] = {
                  ...tracks[matchIdx],
                  previewUrl: ft.previewUrl,
                };
              }
            } else {
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

  tracks = topRelevantTracks(tracks).map(toPublic);

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
      albumScores: spotifyAlbums.map((a) => ({
        name: a.name,
        score: a.score,
      })),
      playlistScores: spotifyPlaylists.map((p) => ({
        name: p.name,
        owner: p.owner?.display_name ?? "",
        score: p.score,
      })),
    };
  }

  return NextResponse.json(payload, {
    headers: {
      "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
