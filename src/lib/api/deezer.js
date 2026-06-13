import {
  norm, tokens, sigTokens, unique, containsAny, bestTitleScore,
  yearScore, soundtrackBonus, sleep, SOUNDTRACK_WORDS,
  BAD_MATCH_WORDS,
  buildSpotifyLikeSoundtrackQueries,
  albumNameMatchesAnyTitle,
  hasDisallowedTitleSuffixForName,
  isPrioritySoundtrackName,
  primarySearchTitle,
  scoreSoundtrackAlbumCandidate,
} from "@/lib/api/soundtrack-utils";

const DEEZER_API = "https://api.deezer.com";
const MAX_TRACKS = 40;
const MAX_ALBUMS = 6;
const ALBUM_MIN_SCORE = 26;
const QUERY_TIMEOUT_MS = 7000;
const SEARCH_QUERY_LIMIT = 8;

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
  return buildSpotifyLikeSoundtrackQueries(ctx, SEARCH_QUERY_LIMIT);
}

function scoreAlbum(album, ctx) {
  const name = album.title ?? "";
  const artist = album.artist?.name ?? "";
  const titles = unique([ctx.originalTitle, ...(ctx.titles || [])]);
  if (!albumNameMatchesAnyTitle(name, titles)) return -999;
  if (hasDisallowedTitleSuffixForName(name, album.release_date, ctx)) return -999;

  const text = norm(`${name} ${artist}`);
  let s = scoreSoundtrackAlbumCandidate(
    {
      name,
      artist,
      releaseDate: album.release_date,
      totalTracks: album.nb_tracks,
      albumType: album.record_type ?? "",
      primaryTitleSearchRank: album.primaryTitleSearchRank,
    },
    { ...ctx, titles },
  );
  if (isPrioritySoundtrackName(name, { ...ctx, titles })) s += 30;

  const nameTokens = new Set(tokens(name));
  const anyTitleToken = titles
    .map(sigTokens)
    .filter((ts) => ts.length)
    .some((ts) => ts.some((t) => nameTokens.has(t)));
  if (!anyTitleToken) s -= 40;

  if (containsAny(text, BAD_MATCH_WORDS)) s -= 80;

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

function normalizeTrack(track, album, index = 0) {
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
    albumScore: Number(album._score ?? 0),
    trackIndex: index,
    score: Number(album._score ?? 0) + Math.max(0, 12 - index * 0.25),
  };
}

async function searchAlbums(query) {
  const url = `${DEEZER_API}/search/album?q=${encodeURIComponent(query)}&limit=15`;
  const data = await fetchJson(url);
  if (!data) return [];
  return Array.isArray(data.data) ? data.data : [];
}

async function getAlbumTracks(albumId) {
  const url = `${DEEZER_API}/album/${albumId}/tracks?limit=80`;
  const data = await fetchJson(url);
  if (!data) return [];
  return Array.isArray(data.data) ? data.data : [];
}

export async function searchDeezer(ctx) {
  if (isRateLimited()) return { tracks: [], query: "" };

  const queries = buildQueries(ctx);
  let allScoredAlbums = [];
  let usedQuery = "";
  const primaryTitle = primarySearchTitle(ctx);

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

    const primaryTitleSearch = Boolean(primaryTitle) && norm(q) === norm(primaryTitle);
    const scored = albums
      .map((a, index) => ({
        ...a,
        searchQuery: q,
        queryIndex: qi,
        searchRank: index + 1,
        primaryTitleSearch,
        primaryTitleSearchRank: primaryTitleSearch ? index + 1 : null,
      }))
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
      for (let i = 0; i < tracks.length; i++) {
        allTracks.push(normalizeTrack(tracks[i], album, i));
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
