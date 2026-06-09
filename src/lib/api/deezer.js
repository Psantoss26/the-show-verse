import {
  norm, tokens, sigTokens, bestTitleScore,
  yearScore, soundtrackBonus, sleep,
} from "@/lib/api/soundtrack-utils";

const DEEZER_API = "https://api.deezer.com";
const MAX_TRACKS = 40;
const MAX_ALBUMS = 4;
const ALBUM_MIN_SCORE = 26;
const QUERY_TIMEOUT_MS = 7000;

let _rateLimitUntil = 0;

function isRateLimited() {
  return _rateLimitUntil > Date.now();
}

function setRateLimit(retryAfter = 5) {
  _rateLimitUntil = Date.now() + retryAfter * 1000;
}

async function fetchJson(url) {
  if (isRateLimited()) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), QUERY_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after")) || 10;
      setRateLimit(retryAfter);
      return null;
    }
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function buildQueries(ctx) {
  const primary = ctx.titles[0] ?? "";
  const alt = ctx.titles[1];
  const qs = [];

  if (primary) {
    qs.push(`${primary} soundtrack`);
    qs.push(`${primary} OST`);
    if (ctx.year) qs.push(`${primary} ${ctx.year} soundtrack`);
    qs.push(`${primary} music from`);
  }

  if (alt && alt !== primary) {
    qs.push(`${alt} soundtrack`);
    if (ctx.year) qs.push(`${alt} ${ctx.year} soundtrack`);
  }

  if (primary) {
    if (ctx.mediaType === "tv") qs.push(`${primary} series soundtrack`);
  }

  return [...new Set(qs.filter(Boolean))].slice(0, 5);
}

function scoreAlbum(album, ctx) {
  const name = album.title ?? "";
  const artist = album.artist?.name ?? "";
  const text = norm(`${name} ${artist}`);

  let s = bestTitleScore(name, ctx.titles);

  if (ctx.originalTitle) {
    const os = bestTitleScore(name, [ctx.originalTitle]);
    if (os >= 70) s += 16;
    else if (os >= 50) s += 8;
  }

  s += soundtrackBonus(text);

  if (/motion picture|television|series|movie|film/.test(text)) s += 10;
  if (ctx.mediaType === "tv" && /series|show|season|episode|tv|television/.test(text)) s += 8;
  if (ctx.mediaType === "movie" && /movie|film|motion picture/.test(text)) s += 8;
  if (ctx.mediaType === "tv" && /movie|film/.test(text) && !/series|show|season|episode|tv|television/.test(text)) s -= 12;
  if (ctx.mediaType === "movie" && /series|season|episode|tv|television/.test(text) && !/movie|film|motion picture/.test(text)) s -= 12;
  if (/original|official/.test(text)) s += 6;

  s += yearScore(album.release_date, ctx.year, ctx.mediaType);

  const total = Number(album.nb_tracks ?? 0);
  if (total >= 4 && total <= 80) s += 8;
  if (total < 3) s -= 18;

  const nameTokens = new Set(tokens(name));
  const anyTitleToken = ctx.titles
    .map(sigTokens)
    .filter((ts) => ts.length)
    .some((ts) => ts.some((t) => nameTokens.has(t)));
  if (!anyTitleToken) s -= 40;

  const hasSigTokens = ctx.titles.some((t) => sigTokens(t).length > 0);
  if (bestTitleScore(name, ctx.titles) === 0 && hasSigTokens) s -= 200;

  const knownComposers = [
    "hans zimmer", "john williams", "danny elfman", "howard shore",
    "enrique santo olalla", "alberto iglesias", "james horner",
    "alan silvestri", "alexandre desplat", "michael giacchino",
    "john powell", "rami djawadi", "bear mccreary", "ludwig göransson",
    "jonny greenwood", "trent reznor", "atticus ross", "jóhann jóhannsson",
    "clint mansell", "harry gregson williams", "james newton howard",
    "christophe beck", "henry jackman", "steve jablonsky", "brian tyler",
    "joe hisaishi", "yann tiersen", "michael nyman", "philip glass",
    "daniel pemberton",
  ];
  if (knownComposers.some((c) => norm(artist).includes(c))) s += 10;

  return Math.round(s);
}

function normalizeTrack(track, album) {
  const cover = album.cover_medium ?? track.album?.cover_medium ?? "";
  const albumTitle = album.title ?? track.album?.title ?? "";
  const albumLink = album.link ?? `https://www.deezer.com/album/${album.id}`;

  return {
    id: `deezer:${track.id}`,
    trackName: track.title ?? "",
    artistName: track.artist?.name ?? "Artista desconocido",
    collectionName: albumTitle,
    previewUrl: track.preview ?? "",
    artworkUrl: cover,
    source: "Deezer",
    externalUrl: track.link ?? albumLink,
    collectionUrl: albumLink,
  };
}

async function searchAlbums(query) {
  const url = `${DEEZER_API}/search/album?q=${encodeURIComponent(query)}&limit=15`;
  const data = await fetchJson(url);
  if (!data) return [];
  return Array.isArray(data.data) ? data.data : [];
}

async function getAlbumTracks(albumId) {
  const url = `${DEEZER_API}/album/${albumId}/tracks&limit=80`;
  const data = await fetchJson(url);
  if (!data) return [];
  return Array.isArray(data.data) ? data.data : [];
}

export async function searchDeezer(ctx) {
  if (isRateLimited()) return { tracks: [], query: "" };

  const queries = buildQueries(ctx);
  let allScoredAlbums = [];
  let usedQuery = "";

  for (let qi = 0; qi < queries.length; qi++) {
    if (isRateLimited()) break;

    const q = queries[qi];

    let albums;
    try {
      albums = await searchAlbums(q);
    } catch {
      continue;
    }

    if (!albums.length) {
      if (qi < queries.length - 1) await sleep(250);
      continue;
    }

    if (!usedQuery) usedQuery = q;

    const scored = albums
      .map((a) => ({ ...a, _score: scoreAlbum(a, ctx) }))
      .filter((a) => a._score >= ALBUM_MIN_SCORE)
      .sort((a, b) => b._score - a._score)
      .slice(0, MAX_ALBUMS);

    allScoredAlbums.push(...scored);

    if (qi < queries.length - 1) await sleep(250);
  }

  const topAlbums = allScoredAlbums
    .sort((a, b) => b._score - a._score)
    .filter((a, i, arr) => arr.findIndex((x) => x.id === a.id) === i)
    .slice(0, MAX_ALBUMS);

  let allTracks = [];
  for (const album of topAlbums) {
    if (isRateLimited()) break;
    try {
      const tracks = await getAlbumTracks(album.id);
      for (const t of tracks) {
        allTracks.push(normalizeTrack(t, album));
      }
    } catch {
      continue;
    }
  }

  const deduped = dedupeTracks(allTracks);
  return {
    tracks: deduped.slice(0, MAX_TRACKS),
    query: usedQuery,
  };
}

function dedupeTracks(tracks) {
  const map = new Map();
  for (const t of tracks) {
    const key = `${norm(t.trackName)}:${norm(t.artistName)}`;
    if (!map.has(key)) map.set(key, t);
  }
  return [...map.values()];
}
