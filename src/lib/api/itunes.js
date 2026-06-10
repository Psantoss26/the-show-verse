import { norm, containsAny, sigTokens, SOUNDTRACK_WORDS, BAD_MATCH_WORDS } from "@/lib/api/soundtrack-utils";

const ITUNES_SEARCH_URL = "https://itunes.apple.com/search";
const ITUNES_LOOKUP_URL = "https://itunes.apple.com/lookup";
const MAX_TRACKS = 40;
const QUERY_TIMEOUT_MS = 7000;

function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), QUERY_TIMEOUT_MS);
  return fetch(url, { signal: ctrl.signal })
    .then((res) => {
      if (!res.ok) throw new Error(`iTunes API ${res.status}`);
      return res.json();
    })
    .finally(() => clearTimeout(timer));
}

function buildQueries(ctx) {
  const queryTitle = ctx.originalTitle || ctx.titles[0] || "";
  return queryTitle ? [queryTitle] : [];
}

function normalizeTrack(track, album) {
  const artwork = (track.artworkUrl100 ?? album.artworkUrl100 ?? "")
    .replace("100x100bb", "500x500bb");

  return {
    id: `itunes:${track.trackId ?? `${norm(track.trackName)}:${norm(track.artistName)}`}`,
    trackName: track.trackName ?? track.trackCensoredName ?? "",
    artistName: track.artistName ?? "Artista desconocido",
    collectionName: album.collectionName ?? track.collectionName ?? "",
    previewUrl: track.previewUrl ?? "",
    artworkUrl: artwork,
    source: "iTunes",
    externalUrl: track.trackViewUrl ?? album.collectionViewUrl ?? "",
    collectionUrl: album.collectionViewUrl ?? "",
  };
}

async function searchAlbums(query, country) {
  const url = `${ITUNES_SEARCH_URL}?${new URLSearchParams({
    term: query,
    media: "music",
    entity: "album",
    limit: "15",
    country,
  })}`;
  const data = await fetchJson(url);
  return (Array.isArray(data?.results) ? data.results : [])
    .filter((r) => r.wrapperType === "collection");
}

async function lookupAlbumTracks(collectionId, country) {
  const url = `${ITUNES_LOOKUP_URL}?${new URLSearchParams({
    id: String(collectionId),
    entity: "song",
    country,
  })}`;
  const data = await fetchJson(url);
  return (Array.isArray(data?.results) ? data.results : [])
    .filter((r) => r.wrapperType === "track" && r.kind === "song");
}

function nameMatches(name, queryTitleNorm, querySigTokens) {
  if (name.includes(queryTitleNorm)) return true;
  if (querySigTokens.length < 2) return false;
  const hits = querySigTokens.filter((t) => name.includes(t)).length;
  return hits / querySigTokens.length >= 0.66;
}

function findBestAlbum(albums, queryTitleNorm) {
  let best = null;
  let bestScore = -Infinity;
  const querySigToks = sigTokens(queryTitleNorm);

  for (const album of albums) {
    const name = norm(album.collectionName ?? album.collectionCensoredName ?? "");
    if (!nameMatches(name, queryTitleNorm, querySigToks)) continue;

    let score = 0;

    if (containsAny(name, SOUNDTRACK_WORDS)) score += 12;
    if (album.primaryGenreName?.toLowerCase().includes("soundtrack")) score += 8;
    if (/original|official/.test(name)) score += 2;

    if (name.includes("broadway")) score -= 30;
    if (name.includes("cast recording")) score -= 25;
    if (containsAny(name, BAD_MATCH_WORDS)) score -= 20;

    if (score > bestScore) {
      bestScore = score;
      best = album;
    }
  }

  return best;
}

export async function searchITunes(ctx, country = "US") {
  const queries = buildQueries(ctx);
  if (queries.length === 0) {
    return { tracks: [], query: "" };
  }

  const query = queries[0];

  let albums;
  try {
    albums = await searchAlbums(query, country);
  } catch {
    return { tracks: [], query };
  }

  const queryTitleNorm = norm(ctx.originalTitle || ctx.titles[0] || "");

  const matchedAlbum = findBestAlbum(albums, queryTitleNorm);

  if (!matchedAlbum) {
    return { tracks: [], query };
  }

  let allTracks = [];
  try {
    const tracks = await lookupAlbumTracks(matchedAlbum.collectionId, country);
    for (const t of tracks) {
      allTracks.push(normalizeTrack(t, matchedAlbum));
    }
  } catch {
    // fall through
  }

  const deduped = dedupeTracks(allTracks);
  return {
    tracks: deduped.slice(0, MAX_TRACKS),
    query,
  };
}

export function dedupeTracks(tracks) {
  const map = new Map();
  for (const t of tracks) {
    const key = `${norm(t.trackName)}:${norm(t.artistName)}`;
    if (!map.has(key)) map.set(key, t);
  }
  return [...map.values()];
}
