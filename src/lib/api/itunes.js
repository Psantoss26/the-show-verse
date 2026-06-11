import {
  norm,
  containsAny,
  sigTokens,
  unique,
  bestTitleScore,
  yearScore,
  SOUNDTRACK_WORDS,
  BAD_MATCH_WORDS,
} from "@/lib/api/soundtrack-utils";

const ITUNES_SEARCH_URL = "https://itunes.apple.com/search";
const ITUNES_LOOKUP_URL = "https://itunes.apple.com/lookup";
const MAX_TRACKS = 40;
const MAX_ALBUMS = 6;
const MIN_ALBUM_SCORE = 0;
const MIN_ALBUM_TRACKS = 3;
const QUERY_TIMEOUT_MS = 7000;
const SEARCH_QUERY_LIMIT = 8;

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
  const titles = unique([ctx.originalTitle, ...(ctx.titles || [])]);
  const qs = [];

  for (const title of titles) {
    const short = norm(title).replace(/\s+/g, "").length <= 3;
    qs.push(title);
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
      qs.push(`${title} ${ctx.year}`);
      qs.push(`${title} ${ctx.year} soundtrack`);
    }
  }

  return unique(qs).slice(0, SEARCH_QUERY_LIMIT);
}

function normalizeTrack(track, album, albumScore = 0, index = 0) {
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
    albumScore,
    trackIndex: index,
    score: albumScore + Math.max(0, 14 - index * 0.25),
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

function nameMatches(name, titleNorms, titleSigTokens) {
  if (titleNorms.some((title) => title && name.includes(title))) return true;

  return titleSigTokens.some((querySigTokens) => {
    if (querySigTokens.length < 2) return false;
    const hits = querySigTokens.filter((t) => name.includes(t)).length;
    return hits / querySigTokens.length >= 0.66;
  });
}

function titleComparisonVariants(value) {
  const normalized = norm(value);
  const variants = new Set([normalized]);
  variants.add(normalized.replace(/([a-z])7([a-z])/g, "$1v$2"));
  return [...variants].filter(Boolean);
}

function hasLiteralTitlePhrase(name, title) {
  const nameTokens = name.split(" ").filter(Boolean);
  const titleTokens = title.split(" ").filter(Boolean);
  if (!nameTokens.length || !titleTokens.length) return false;

  return nameTokens.some((_, index) =>
    titleTokens.every((token, offset) => nameTokens[index + offset] === token),
  );
}

function hasStrictTitleMatch(name, ctx) {
  const titles = unique([ctx.originalTitle, ...(ctx.titles || [])]);

  return titles.some((title) =>
    titleComparisonVariants(title).some((titleVariant) =>
      titleComparisonVariants(name).some((nameVariant) =>
        hasLiteralTitlePhrase(nameVariant, titleVariant),
      ),
    ),
  );
}

function hasDisallowedTitleSuffix(name, releaseDate, ctx) {
  const titles = unique([ctx.originalTitle, ...(ctx.titles || [])]);
  const releaseYear = Number(String(releaseDate ?? "").slice(0, 4));
  const nameVariants = titleComparisonVariants(name);

  return titles.some((title) => {
    if (/\d/.test(norm(title))) return false;
    if (
      ctx.year &&
      Number.isFinite(releaseYear) &&
      Math.abs(releaseYear - ctx.year) <= 1
    ) {
      return false;
    }

    return titleComparisonVariants(title).some((titleVariant) => {
      const titleTokens = titleVariant.split(" ").filter(Boolean);
      if (!titleTokens.length) return false;

      return nameVariants.some((nameVariant) => {
        const nameTokens = nameVariant.split(" ").filter(Boolean);
        return nameTokens.some((_, index) => {
          const matches = titleTokens.every(
            (token, offset) => nameTokens[index + offset] === token,
          );
          if (!matches) return false;

          const nextToken = nameTokens[index + titleTokens.length] ?? "";
          return /^\d+$/.test(nextToken) || /^[ivx]+$/.test(nextToken);
        });
      });
    });
  });
}

function isStrictSoundtrackAlbumName(name) {
  return (
    /official/.test(name) ||
    /soundtrack/.test(name) ||
    /original motion picture/.test(name) ||
    /banda sonora/.test(name) ||
    /score/.test(name)
  );
}

function scoreAlbums(albums, ctx, options = {}) {
  const titleNorms = unique([ctx.originalTitle, ...(ctx.titles || [])]).map(norm);
  const titleSigTokens = titleNorms.map(sigTokens).filter((ts) => ts.length);
  const hasShortTitle = titleNorms.some(
    (title) => title.replace(/\s+/g, "").length <= 3,
  );
  const scored = [];

  for (const album of albums) {
    const name = norm(album.collectionName ?? album.collectionCensoredName ?? "");
    if (!nameMatches(name, titleNorms, titleSigTokens)) continue;
    if (options.strictSoundtrackAlbums) {
      if (!isStrictSoundtrackAlbumName(name)) continue;
      if (!hasStrictTitleMatch(name, ctx)) continue;
      if (hasDisallowedTitleSuffix(name, album.releaseDate, ctx)) continue;
    }

    const genre = norm(album.primaryGenreName ?? "");
    const text = `${name} ${genre}`;
    const hasSoundtrackContext =
      containsAny(text, SOUNDTRACK_WORDS) ||
      /album|motion picture|television|series|movie|film|score|ost/.test(text);
    let score = bestTitleScore(name, titleNorms);

    if (containsAny(text, SOUNDTRACK_WORDS)) score += 16;
    if (/original|official/.test(name)) score += 2;
    if (/movie|film|motion picture/.test(name)) score += 8;
    if (/album/.test(name)) score += 4;
    if (hasShortTitle && !hasSoundtrackContext) score -= 100;
    if (ctx.mediaType === "movie" && /game|video game|manager|simulator/.test(text) && !/movie|film|motion picture/.test(text)) score -= 120;

    if (name.includes("broadway")) score -= 30;
    if (name.includes("cast recording")) score -= 25;
    if (containsAny(name, BAD_MATCH_WORDS)) score -= 80;

    const trackCount = Number(album.trackCount ?? 0);
    if (trackCount < MIN_ALBUM_TRACKS) continue;
    if (trackCount >= 10) score += 4;
    score += yearScore(album.releaseDate, ctx.year, ctx.mediaType);

    const nameTokens = name.split(" ");
    if (nameTokens.includes("ep")) score -= 15;
    if (nameTokens.includes("single")) score -= 15;

    if (score >= MIN_ALBUM_SCORE) {
      scored.push({ album, score });
    }
  }

  return scored.sort((a, b) => b.score - a.score);
}

export async function searchITunes(ctx, country = "US", options = {}) {
  const queries = buildQueries(ctx);
  if (queries.length === 0) {
    return { tracks: [], query: "" };
  }

  let usedQuery = "";
  let allAlbums = [];
  for (const query of queries) {
    let albums;
    try {
      albums = await searchAlbums(query, country);
    } catch {
      continue;
    }

    if (albums.length && !usedQuery) usedQuery = query;
    allAlbums.push(...albums);
  }

  if (!allAlbums.length) {
    return { tracks: [], query: queries[0] };
  }

  const uniqueAlbums = allAlbums.filter(
    (album, index, arr) =>
      arr.findIndex((item) => item.collectionId === album.collectionId) ===
      index,
  );
  const ranked = scoreAlbums(uniqueAlbums, ctx, options);
  const topAlbums = ranked.slice(0, MAX_ALBUMS);

  if (topAlbums.length === 0) {
    return { tracks: [], query: usedQuery || queries[0] };
  }

  let allTracks = [];
  for (const rankedAlbum of topAlbums) {
    const album = rankedAlbum.album;
    try {
      const tracks = await lookupAlbumTracks(album.collectionId, country);
      for (let i = 0; i < tracks.length; i++) {
        allTracks.push(normalizeTrack(tracks[i], album, rankedAlbum.score, i));
      }
    } catch {
      continue;
    }
  }

  const deduped = dedupeTracks(allTracks);
  return {
    tracks: deduped.slice(0, MAX_TRACKS),
    query: usedQuery || queries[0],
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
