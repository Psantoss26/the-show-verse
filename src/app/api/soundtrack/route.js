import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ITUNES_SEARCH_URL = "https://itunes.apple.com/search";
const ITUNES_LOOKUP_URL = "https://itunes.apple.com/lookup";
const MUSICBRAINZ_RELEASE_GROUP_URL =
  "https://musicbrainz.org/ws/2/release-group";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const REQUEST_TIMEOUT_MS = 6500;
const MAX_ALBUMS_TO_LOOKUP = 5;
const MAX_TRACKS = 30;
const MAX_SPOTIFY_PLAYLISTS = 5;
const SPOTIFY_PLAYLIST_SEARCH_LIMIT = 20;
const SPOTIFY_PLAYLIST_MIN_SCORE = 46;
const OFFICIAL_ALBUM_THRESHOLD = 58;
const LOOSE_ALBUM_THRESHOLD = 42;
const DIRECT_TRACK_THRESHOLD = 24;
const MIN_TRACKS_BEFORE_FALLBACK = 10;

const g = globalThis;
g.__showVerseSpotifyToken = g.__showVerseSpotifyToken || {
  accessToken: "",
  expiresAt: 0,
};

const SOUNDTRACK_WORDS = [
  "soundtrack",
  "score",
  "original score",
  "original motion picture",
  "motion picture soundtrack",
  "original soundtrack",
  "television soundtrack",
  "tv soundtrack",
  "ost",
  "music from",
  "music from and inspired",
  "music inspired",
  "banda sonora",
  "musica de la pelicula",
  "musica original",
];

const BAD_MATCH_WORDS = [
  "karaoke",
  "tribute",
  "cover",
  "covers",
  "remix",
  "remixes",
  "music box",
  "lullaby",
  "lofi",
  "lo-fi",
  "workout",
  "ringtone",
  "theme from",
  "in the style of",
  "inspired by the film score",
  "piano tribute",
  "trailer music",
];

const GENERIC_TITLE_WORDS = new Set([
  "a",
  "an",
  "and",
  "de",
  "del",
  "el",
  "en",
  "la",
  "las",
  "le",
  "les",
  "los",
  "of",
  "on",
  "the",
  "to",
  "un",
  "una",
  "y",
]);

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’`´]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function titleTokens(title) {
  return normalizeText(title)
    .split(" ")
    .filter((token) => token.length > 1 && !GENERIC_TITLE_WORDS.has(token));
}

function textTokens(value) {
  const normalized = normalizeText(value);
  return normalized ? normalized.split(" ") : [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function getYear(value) {
  const year = Number(String(value || "").slice(0, 4));
  return Number.isFinite(year) && year > 1800 ? year : null;
}

function containsAny(text, words) {
  return words.some((word) => text.includes(normalizeText(word)));
}

function titleCoverageScore(text, title) {
  const normalizedTitleTokens = textTokens(title);
  const normalizedTextTokens = textTokens(text);
  const tokens = titleTokens(title);

  if (!normalizedTitleTokens.length || !normalizedTextTokens.length) return 0;

  const textTokenSet = new Set(normalizedTextTokens);
  if (normalizedTitleTokens.length === 1 && normalizedTitleTokens[0].length <= 4) {
    return textTokenSet.has(normalizedTitleTokens[0])
      ? normalizedTextTokens.length === 1
        ? 60
        : 30
      : 0;
  }

  const hasExactPhrase = normalizedTextTokens.some((_, index) =>
    normalizedTitleTokens.every(
      (token, tokenIndex) => normalizedTextTokens[index + tokenIndex] === token,
    ),
  );
  if (hasExactPhrase) return 60;

  if (!tokens.length) return 0;

  const hits = tokens.filter((token) => textTokenSet.has(token)).length;
  const ratio = hits / tokens.length;

  if (ratio >= 1) return 42;
  if (ratio >= 0.75) return 28;
  if (ratio >= 0.5 && tokens.length >= 3) return 16;
  return 0;
}

function bestTitleCoverageScore(text, titles) {
  return Math.max(...titles.map((title) => titleCoverageScore(text, title)), 0);
}

function yearScore(releaseDate, titleYear, mediaType) {
  if (!titleYear) return 0;
  const releaseYear = getYear(releaseDate);
  if (!releaseYear) return 0;

  const diff = releaseYear - titleYear;
  if (diff === 0) return 18;
  if (diff === 1) return 12;
  if (diff === -1) return 8;
  if (mediaType === "tv" && diff >= 0 && diff <= 4) return 8;
  if (Math.abs(diff) <= 3) return 3;
  return -20;
}

function albumScore(album, { title, year, mediaType }) {
  const titles = Array.isArray(title) ? title : [title];
  const collectionName = album?.collectionName || "";
  const artistName = album?.artistName || "";
  const text = normalizeText(`${collectionName} ${artistName}`);
  const collectionTextTokens = new Set(textTokens(collectionName));
  let score = 0;
  const collectionCoverage = bestTitleCoverageScore(collectionName, titles);

  score += collectionCoverage;
  if (collectionCoverage > 0) {
    score += bestTitleCoverageScore(`${collectionName} ${artistName}`, titles) * 0.25;
  }

  if (containsAny(text, SOUNDTRACK_WORDS)) score += 34;
  if (text.includes("original")) score += 6;
  if (text.includes("various artists")) score += 5;
  if (mediaType === "tv" && /television|tv|series|season/.test(text)) score += 8;
  if (mediaType === "movie" && /motion picture|film|movie|pelicula/.test(text)) {
    score += 8;
  }

  score += yearScore(album?.releaseDate, year, mediaType);

  if (containsAny(text, BAD_MATCH_WORDS)) score -= 55;
  if (!containsAny(text, SOUNDTRACK_WORDS)) score -= 18;

  const tokenSets = titles.map(titleTokens).filter((tokens) => tokens.length);
  const hasAnyTitleTokenMatchInAlbum = tokenSets.some((tokens) =>
    tokens.some((token) => collectionTextTokens.has(token)),
  );
  if (tokenSets.length && !hasAnyTitleTokenMatchInAlbum) score -= 70;

  const isSingleShortTitle = tokenSets.some(
    (tokens) => tokens.length === 1 && tokens[0].length <= 4,
  );
  if (isSingleShortTitle && collectionCoverage < 60) score -= 24;

  if (isSingleShortTitle) {
    const shortToken = tokenSets.find(
      (tokens) => tokens.length === 1 && tokens[0].length <= 4,
    )?.[0];
    const collectionTokens = textTokens(collectionName);
    const tokenIndex = collectionTokens.indexOf(shortToken);
    const anchoredToMediaPhrase =
      collectionTokens.some(
        (token, index) =>
          token === shortToken &&
          ["picture", "film", "movie", "series", "show"].includes(
            collectionTokens[index - 1],
          ),
      ) ||
      collectionTokens.some(
        (token, index) =>
          token === shortToken &&
          ["picture", "film", "movie", "series", "show"].includes(
            collectionTokens[index - 2],
          ),
      );

    if (tokenIndex > 2 && !anchoredToMediaPhrase) score -= 35;
  }

  const hasMultiWordTitle = titles.some((value) => textTokens(value).length > 1);
  if (hasMultiWordTitle && isSingleShortTitle && collectionCoverage < 60) {
    score -= 35;
  }

  return Math.round(score);
}

function albumAnchorScore(album, titles) {
  const collectionTokens = textTokens(album?.collectionName || "");

  for (const title of titles) {
    const normalizedTitleTokens = textTokens(title);
    if (!normalizedTitleTokens.length || !collectionTokens.length) continue;

    const hasExactPhrase = collectionTokens.some((_, index) =>
      normalizedTitleTokens.every(
        (token, tokenIndex) => collectionTokens[index + tokenIndex] === token,
      ),
    );

    if (hasExactPhrase) {
      const startsWithPhrase = normalizedTitleTokens.every(
        (token, index) => collectionTokens[index] === token,
      );
      return startsWithPhrase ? 3 : 2;
    }

    const meaningfulTokens = titleTokens(title);
    if (meaningfulTokens.length === 1 && meaningfulTokens[0].length <= 4) {
      const shortToken = meaningfulTokens[0];
      const tokenIndex = collectionTokens.indexOf(shortToken);
      if (tokenIndex === 0) return 3;
      const anchoredToMediaPhrase = collectionTokens.some(
        (token, index) =>
          token === shortToken &&
          ["picture", "film", "movie", "series", "show"].includes(
            collectionTokens[index - 1],
          ),
      );
      if (anchoredToMediaPhrase) return 2;
    }
  }

  return 0;
}

function releaseYearDiff(album, year) {
  if (!year) return null;
  const releaseYear = getYear(album?.releaseDate);
  return releaseYear ? releaseYear - year : null;
}

function refineRankedAlbums(albums, context) {
  if (!albums.length) return albums;

  const bestAnchor = albumAnchorScore(albums[0], context.titles);
  const bestYearDiff = releaseYearDiff(albums[0], context.year);

  return albums.filter((album, index) => {
    if (index === 0) return true;

    const anchor = albumAnchorScore(album, context.titles);
    if (bestAnchor >= 3 && anchor < 3) return false;

    const diff = releaseYearDiff(album, context.year);
    if (
      bestYearDiff != null &&
      Math.abs(bestYearDiff) <= 1 &&
      diff != null &&
      Math.abs(diff) > (context.mediaType === "tv" ? 4 : 2)
    ) {
      return false;
    }

    return true;
  });
}

function trackScore(track, albumScores, context) {
  const collectionScore = albumScores.get(String(track?.collectionId)) ?? 0;
  const text = normalizeText(
    `${track?.trackName || ""} ${track?.artistName || ""} ${
      track?.collectionName || ""
    }`,
  );
  let score = collectionScore;

  score += bestTitleCoverageScore(track?.collectionName, context.titles) * 0.4;
  score += bestTitleCoverageScore(
    `${track?.trackName || ""} ${track?.collectionName || ""}`,
    context.titles,
  ) * 0.2;
  if (containsAny(text, SOUNDTRACK_WORDS)) score += 14;
  if (containsAny(text, BAD_MATCH_WORDS)) score -= 55;
  if (!track?.previewUrl) score -= 100;

  return Math.round(score);
}

function peopleNames(list) {
  return Array.isArray(list) ? list.map((item) => item?.name).filter(Boolean) : [];
}

function primaryImage(images) {
  return Array.isArray(images) && images.length ? images[0]?.url || "" : "";
}

function normalizeTrack(track, { score, sourceQuery, source = "iTunes" }) {
  const artwork =
    track?.artworkUrl100?.replace("100x100bb", "600x600bb") ||
    track?.artworkUrl60?.replace("60x60bb", "600x600bb") ||
    track?.artworkUrl100 ||
    "";

  return {
    id: String(track?.trackId || track?.previewUrl),
    trackName: track?.trackName || "",
    artistName: track?.artistName || "Artista desconocido",
    collectionName: track?.collectionName || "",
    previewUrl: track?.previewUrl || "",
    artworkUrl: artwork,
    source,
    externalUrl: track?.trackViewUrl || "",
    score,
    sourceQuery,
  };
}

function normalizeSpotifyTrack(track, { score, playlistName }) {
  const artists = peopleNames(track?.artists);
  return {
    id: `spotify:${track?.id || `${track?.name}:${artists.join(",")}`}`,
    spotifyId: track?.id || "",
    isrc: track?.external_ids?.isrc || "",
    trackName: track?.name || "",
    artistName: artists.join(", ") || "Artista desconocido",
    collectionName: playlistName || track?.album?.name || "",
    previewUrl: track?.preview_url || "",
    artworkUrl: primaryImage(track?.album?.images),
    source: "Spotify",
    externalUrl: track?.external_urls?.spotify || "",
    score,
  };
}

function buildAlbumQueries({ title, year, mediaType }) {
  const titles = Array.isArray(title) ? title : [title];
  const typed = mediaType === "tv" ? "television soundtrack" : "soundtrack";
  const motion = mediaType === "tv" ? "series soundtrack" : "motion picture soundtrack";

  return unique(
    titles.flatMap((baseTitle) => [
      `${baseTitle} ${year || ""} original ${motion}`,
      `${baseTitle} ${year || ""} ${typed}`,
      `${baseTitle} ${year || ""} OST`,
      `${baseTitle} original soundtrack`,
      `${baseTitle} soundtrack`,
      `${baseTitle} original score`,
      `${baseTitle} music from ${
        mediaType === "tv" ? "the series" : "the motion picture"
      }`,
    ]),
  ).map((query) => query.trim().replace(/\s+/g, " "));
}

function buildSongFallbackQueries({ title, year, mediaType }) {
  const titles = Array.isArray(title) ? title : [title];
  const label = mediaType === "tv" ? "series soundtrack" : "movie soundtrack";
  return unique(
    titles.flatMap((baseTitle) => [
      `${baseTitle} ${year || ""} ${label}`,
      `${baseTitle} ${year || ""} soundtrack`,
      `${baseTitle} soundtrack`,
      `${baseTitle} songs`,
      `${baseTitle} music`,
      `${baseTitle} original soundtrack`,
    ]),
  ).map((query) => query.trim().replace(/\s+/g, " "));
}

function buildSpotifyPlaylistQueries({ title, year, mediaType }) {
  const titles = Array.isArray(title) ? title : [title];
  const label = mediaType === "tv" ? "series soundtrack" : "movie soundtrack";
  const typed =
    mediaType === "tv"
      ? "original television soundtrack"
      : "original motion picture soundtrack";

  return unique(
    titles.flatMap((baseTitle) => [
      `${baseTitle} soundtrack`,
      `${baseTitle} ${typed}`,
      `${baseTitle} official soundtrack`,
      `${baseTitle} OST`,
      `${baseTitle} songs`,
      `${baseTitle} music from`,
      `${baseTitle} ${label}`,
      `${baseTitle} ${year || ""} soundtrack`,
      `${baseTitle} ${year || ""} ${label}`,
    ]),
  ).map((query) => query.trim().replace(/\s+/g, " "));
}

function escapeMusicBrainzQueryValue(value) {
  return String(value || "").replace(/[\\"]/g, " ");
}

async function fetchJson(
  url,
  { label = "request", headers = {}, method = "GET", body = undefined } = {},
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      body,
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "accept-language": "en-US,en;q=0.9,es;q=0.8",
        ...headers,
      },
      ...(method === "GET" ? { next: { revalidate: 60 * 60 * 24 } } : {}),
    });

    if (!response.ok) {
      throw new Error(`${label} respondió ${response.status}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function getSpotifyCredentials() {
  const clientId = process.env.SPOTIFY_CLIENT_ID || process.env.NEXT_SPOTIFY_CLIENT_ID;
  const clientSecret =
    process.env.SPOTIFY_CLIENT_SECRET || process.env.NEXT_SPOTIFY_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

async function getSpotifyClientToken() {
  const credentials = getSpotifyCredentials();
  if (!credentials) return null;

  const cached = g.__showVerseSpotifyToken;
  if (cached.accessToken && cached.expiresAt > Date.now() + 30000) {
    return cached.accessToken;
  }

  const body = new URLSearchParams({ grant_type: "client_credentials" });
  const basic = Buffer.from(
    `${credentials.clientId}:${credentials.clientSecret}`,
  ).toString("base64");

  const payload = await fetchJson(SPOTIFY_TOKEN_URL, {
    label: "Spotify auth",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    method: "POST",
    body,
  });

  if (!payload?.access_token) return null;

  cached.accessToken = payload.access_token;
  cached.expiresAt = Date.now() + Number(payload.expires_in || 3600) * 1000;
  return cached.accessToken;
}

async function getSpotifyUserToken() {
  const credentials = getSpotifyCredentials();
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;
  if (!credentials || !refreshToken) return null;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const basic = Buffer.from(
    `${credentials.clientId}:${credentials.clientSecret}`,
  ).toString("base64");

  const payload = await fetchJson(SPOTIFY_TOKEN_URL, {
    label: "Spotify refresh",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    method: "POST",
    body,
  });

  return payload?.access_token || null;
}

async function fetchSpotifyJson(path, token, params = {}) {
  const url = new URL(`${SPOTIFY_API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  }

  return fetchJson(url.toString(), {
    label: "Spotify",
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
}

async function searchItunesAlbums(query, country) {
  const params = new URLSearchParams({
    term: query,
    media: "music",
    entity: "album",
    attribute: "albumTerm",
    country,
    limit: "25",
  });

  const payload = await fetchJson(`${ITUNES_SEARCH_URL}?${params.toString()}`);
  return (Array.isArray(payload?.results) ? payload.results : []).map((album) => ({
    ...album,
    sourceCountry: country,
    sourceQuery: query,
  }));
}

async function lookupAlbumTracks(albums) {
  const groups = new Map();
  for (const album of albums) {
    const country = album.sourceCountry || "US";
    if (!groups.has(country)) groups.set(country, []);
    groups.get(country).push(album);
  }

  const payloads = await Promise.allSettled(
    [...groups.entries()].map(([country, countryAlbums]) => {
      const ids = countryAlbums.map((album) => album.collectionId).join(",");
      const params = new URLSearchParams({
        id: ids,
        entity: "song",
        country,
        limit: "200",
      });
      return fetchJson(`${ITUNES_LOOKUP_URL}?${params.toString()}`);
    }),
  );

  return payloads.flatMap((result) => {
    if (result.status !== "fulfilled") return [];
    return Array.isArray(result.value?.results) ? result.value.results : [];
  });
}

async function searchFallbackSongs(query, country) {
  const params = new URLSearchParams({
    term: query,
    media: "music",
    entity: "song",
    country,
    limit: "35",
  });

  const payload = await fetchJson(`${ITUNES_SEARCH_URL}?${params.toString()}`);
  return (Array.isArray(payload?.results) ? payload.results : []).map((track) => ({
    ...track,
    sourceCountry: country,
    sourceQuery: query,
  }));
}

function playlistScore(playlist, context) {
  const name = playlist?.name || "";
  const description = playlist?.description || "";
  const ownerName = playlist?.owner?.display_name || "";
  const text = normalizeText(`${name} ${description} ${ownerName}`);
  const nameCoverage = bestTitleCoverageScore(name, context.titles);
  const originalCoverage = context.originalTitle
    ? titleCoverageScore(name, context.originalTitle)
    : 0;
  let score = nameCoverage;

  if (originalCoverage >= 60) score += 22;
  else if (originalCoverage >= 42) score += 12;
  if (containsAny(text, SOUNDTRACK_WORDS)) score += 32;
  if (/playlist|songs|music|soundtrack|ost|score/.test(text)) score += 10;
  if (context.mediaType === "tv" && /series|show|season|episode|tv/.test(text)) {
    score += 8;
  }
  if (context.mediaType === "movie" && /movie|film|motion picture/.test(text)) {
    score += 8;
  }

  const total = Number(playlist?.tracks?.total || 0);
  if (total >= 8 && total <= 120) score += 12;
  if (total > 160) score -= 18;
  if (total < 3) score -= 20;

  if (containsAny(text, BAD_MATCH_WORDS)) score -= 45;

  const pseudoAlbum = {
    collectionName: name,
    artistName: ownerName,
    releaseDate: context.year || "",
  };
  const anchor = albumAnchorScore(pseudoAlbum, context.titles);
  if (anchor >= 3) score += 28;
  else if (anchor >= 2) score += 14;
  if (nameCoverage >= 60 && containsAny(text, SOUNDTRACK_WORDS)) score += 12;

  const tokenSets = context.titles.map(titleTokens).filter((tokens) => tokens.length);
  const nameTokenSet = new Set(textTokens(name));
  const hasAnyTitleTokenMatchInName = tokenSets.some((tokens) =>
    tokens.some((token) => nameTokenSet.has(token)),
  );
  if (tokenSets.length && !hasAnyTitleTokenMatchInName) score -= 65;

  const isSingleShortTitle = tokenSets.some(
    (tokens) => tokens.length === 1 && tokens[0].length <= 4,
  );
  if (isSingleShortTitle && anchor < 2) score -= 30;

  return Math.round(score);
}

async function searchSpotifyPlaylists(context, market) {
  const token = (await getSpotifyUserToken()) || (await getSpotifyClientToken());
  if (!token) return [];

  const queries = buildSpotifyPlaylistQueries(context);
  const payloads = await Promise.allSettled(
    queries.map((query) =>
      fetchSpotifyJson("/search", token, {
        q: query,
        type: "playlist",
        market,
        limit: SPOTIFY_PLAYLIST_SEARCH_LIMIT,
      }),
    ),
  );

  const rankedPlaylists = payloads
    .flatMap((result) =>
      result.status === "fulfilled"
        ? Array.isArray(result.value?.playlists?.items)
          ? result.value.playlists.items
          : []
        : [],
    )
    .filter(Boolean)
    .map((playlist) => ({
      ...playlist,
      score: playlistScore(playlist, context),
    }))
    .filter((playlist) => playlist.score >= SPOTIFY_PLAYLIST_MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .filter(
      (playlist, index, all) =>
        all.findIndex((candidate) => candidate?.id === playlist?.id) === index,
    );

  const bestScore = rankedPlaylists[0]?.score || 0;
  return rankedPlaylists
    .filter(
      (playlist) =>
        playlist.score >= SPOTIFY_PLAYLIST_MIN_SCORE &&
        playlist.score >= Math.max(SPOTIFY_PLAYLIST_MIN_SCORE, bestScore - 24),
    )
    .slice(0, MAX_SPOTIFY_PLAYLISTS);
}

async function getSpotifyPlaylistTracks(playlist, market) {
  const token = (await getSpotifyUserToken()) || (await getSpotifyClientToken());
  if (!token || !playlist?.id) return [];

  try {
    const payload = await fetchSpotifyJson(
      `/playlists/${encodeURIComponent(playlist.id)}/items`,
      token,
      {
        market,
        limit: 50,
        fields:
          "items(track(id,name,preview_url,external_ids,is_playable,external_urls,album(name,images,release_date),artists(name),duration_ms,popularity,type)),total",
      },
    );

    return (Array.isArray(payload?.items) ? payload.items : [])
      .map((item) => item?.track)
      .filter((track) => track?.type === "track" && track?.name)
      .map((track, index) =>
        normalizeSpotifyTrack(track, {
          playlistName: playlist.name,
          score:
            playlist.score +
            Math.max(0, 22 - index * 0.45) +
            Math.min(Number(track?.popularity || 0) / 25, 4),
        }),
      );
  } catch {
    return [];
  }
}

async function searchItunesPreviewForTrack(track, countries) {
  const queries = unique([
    track.isrc ? `isrc:${track.isrc}` : "",
    `${track.trackName} ${track.artistName}`,
  ]);

  const payloads = await Promise.allSettled(
    queries.flatMap((query) =>
      countries.map((country) => searchFallbackSongs(query, country)),
    ),
  );

  const candidates = payloads
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .filter((item) => item?.previewUrl && item?.trackName);

  let best = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    let score = 0;
    score += titleCoverageScore(candidate.trackName, track.trackName);
    score += titleCoverageScore(candidate.artistName, track.artistName) * 0.6;
    if (normalizeText(candidate.trackName) === normalizeText(track.trackName)) {
      score += 35;
    }
    if (normalizeText(candidate.artistName) === normalizeText(track.artistName)) {
      score += 20;
    }
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return bestScore >= 55 ? best : null;
}

async function enrichSpotifyTracksWithPreviews(tracks, countries) {
  const enriched = [];
  const missingPreview = tracks.filter((track) => !track.previewUrl).slice(0, 24);
  const previewMatches = await Promise.allSettled(
    missingPreview.map((track) => searchItunesPreviewForTrack(track, countries)),
  );
  const matchById = new Map();

  previewMatches.forEach((result, index) => {
    if (result.status === "fulfilled" && result.value) {
      matchById.set(missingPreview[index].id, result.value);
    }
  });

  for (const track of tracks) {
    const match = matchById.get(track.id);
    if (match) {
      enriched.push({
        ...track,
        previewUrl: match.previewUrl,
        artworkUrl:
          track.artworkUrl ||
          match.artworkUrl100?.replace("100x100bb", "600x600bb") ||
          "",
        source: "Spotify",
      });
    } else {
      enriched.push(track);
    }
  }

  return enriched;
}

async function loadSpotifyPlaylistTracks(context, countries) {
  let playlists = [];

  try {
    playlists = await searchSpotifyPlaylists(context, countries[0] || "US");
  } catch {
    return { playlists: [], tracks: [] };
  }

  if (!playlists.length) return { playlists: [], tracks: [] };

  const payloads = await Promise.allSettled(
    playlists.map((playlist) => getSpotifyPlaylistTracks(playlist, countries[0] || "US")),
  );
  const tracks = payloads.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );

  return {
    playlists,
    tracks: await enrichSpotifyTracksWithPreviews(tracks, countries),
  };
}

async function searchMusicBrainzReleaseGroups(context) {
  const title = context.titles[0];
  if (!title) return [];

  const params = new URLSearchParams({
    query: `releasegroup:"${escapeMusicBrainzQueryValue(title)}" AND secondarytype:soundtrack`,
    fmt: "json",
    limit: "8",
  });

  const payload = await fetchJson(
    `${MUSICBRAINZ_RELEASE_GROUP_URL}?${params.toString()}`,
    {
      label: "MusicBrainz",
      headers: {
        "user-agent":
          "TheShowVerse/0.1.0 (https://github.com; soundtrack metadata lookup)",
      },
    },
  );

  return (Array.isArray(payload?.["release-groups"])
    ? payload["release-groups"]
    : []
  )
    .map((releaseGroup) => {
      const artistName = Array.isArray(releaseGroup?.["artist-credit"])
        ? releaseGroup["artist-credit"].map((credit) => credit?.name).filter(Boolean).join(", ")
        : "";
      const score = albumScore(
        {
          collectionName: releaseGroup?.title || "",
          artistName,
          releaseDate: releaseGroup?.["first-release-date"] || "",
        },
        context,
      );

      return {
        title: releaseGroup?.title || "",
        artistName,
        score,
      };
    })
    .filter((releaseGroup) => releaseGroup.title && releaseGroup.score >= 52)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

async function searchAlbumsFromMusicBrainzCandidates(context, countries) {
  let releaseGroups = [];

  try {
    releaseGroups = await searchMusicBrainzReleaseGroups(context);
  } catch {
    return [];
  }

  if (!releaseGroups.length) return [];

  const payloads = await Promise.allSettled(
    releaseGroups.flatMap((releaseGroup) =>
      countries.map((country) => {
        const query = `${releaseGroup.title} ${releaseGroup.artistName}`.trim();
        return searchItunesAlbums(query, country);
      }),
    ),
  );

  return payloads
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .map((album) => ({
      ...album,
      score: albumScore(album, context) + 6,
    }))
    .filter((album) => album.score >= LOOSE_ALBUM_THRESHOLD);
}

function dedupeAlbums(albums) {
  const byId = new Map();
  for (const album of albums) {
    const id = String(album?.collectionId || "");
    if (!id) continue;
    const prev = byId.get(id);
    if (!prev || (album.score || 0) > (prev.score || 0)) byId.set(id, album);
  }
  return [...byId.values()];
}

function dedupeTracks(tracks) {
  const byKey = new Map();

  for (const track of tracks) {
    const semanticKey = `${normalizeText(track.trackName)}:${normalizeText(
      track.artistName,
    )}`;
    const key = semanticKey.replace(/:/g, "") ? semanticKey : track.id;
    const prev = byKey.get(key);
    if (!prev || track.score > prev.score) byKey.set(key, track);
  }

  return [...byKey.values()];
}

function toPublicTrack(track) {
  return {
    id: track.id,
    trackName: track.trackName,
    artistName: track.artistName,
    collectionName: track.collectionName,
    previewUrl: track.previewUrl,
    artworkUrl: track.artworkUrl,
    source: track.source,
    externalUrl: track.externalUrl || "",
  };
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const title = String(searchParams.get("title") || "").trim();
  const originalTitle = String(searchParams.get("originalTitle") || "").trim();
  const mediaType = searchParams.get("type") === "tv" ? "tv" : "movie";
  const year = getYear(searchParams.get("year"));
  const country = String(searchParams.get("country") || "US").toUpperCase();

  if (!title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }

  const titles = unique([originalTitle, title]);
  const context = { title: titles, titles, originalTitle, year, mediaType };
  const albumQueries = buildAlbumQueries(context);
  const countries = unique([country, "US"]);

  try {
    const spotifyResult = await loadSpotifyPlaylistTracks(context, countries);
    const albumResults = await Promise.allSettled(
      albumQueries.flatMap((query) =>
        countries.map((storeCountry) => searchItunesAlbums(query, storeCountry)),
      ),
    );

    const rankedAlbums = refineRankedAlbums(
      dedupeAlbums(
        albumResults
          .flatMap((result) =>
            result.status === "fulfilled" ? result.value : [],
          )
          .map((album) => ({
            ...album,
            score: albumScore(album, context),
          }))
          .filter((album) => album.score >= OFFICIAL_ALBUM_THRESHOLD),
      )
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_ALBUMS_TO_LOOKUP),
      context,
    );

    if (rankedAlbums.length < 2) {
      const musicBrainzAlbums = await searchAlbumsFromMusicBrainzCandidates(
        context,
        countries,
      );
      rankedAlbums.push(
        ...dedupeAlbums(musicBrainzAlbums)
          .sort((a, b) => b.score - a.score)
          .slice(0, Math.max(0, MAX_ALBUMS_TO_LOOKUP - rankedAlbums.length)),
      );
    }

    const albumScores = new Map(
      rankedAlbums.map((album) => [String(album.collectionId), album.score]),
    );

    let tracks = spotifyResult.tracks;

    if (rankedAlbums.length) {
      const lookupResults = await lookupAlbumTracks(rankedAlbums);
      const albumTracks = lookupResults
        .filter((item) => item?.wrapperType === "track" && item?.kind === "song")
        .map((track) => ({
          track,
          score: trackScore(track, albumScores, context),
        }))
        .filter(({ track, score }) => track?.previewUrl && track?.trackName && score >= 48)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          const aDisc = Number(a.track?.discNumber || 0);
          const bDisc = Number(b.track?.discNumber || 0);
          if (aDisc !== bDisc) return aDisc - bDisc;
          return Number(a.track?.trackNumber || 0) - Number(b.track?.trackNumber || 0);
        })
        .map(({ track, score }) =>
          normalizeTrack(track, {
            score,
            sourceQuery:
              rankedAlbums.find(
                (album) => String(album.collectionId) === String(track.collectionId),
              )?.sourceQuery || "",
          }),
        );

      tracks = [...tracks, ...albumTracks];
    }

    if (tracks.length < MIN_TRACKS_BEFORE_FALLBACK) {
      const fallbackQueries = buildSongFallbackQueries(context);
      const fallbackResults = await Promise.allSettled(
        fallbackQueries.flatMap((query) =>
          countries.map((storeCountry) => searchFallbackSongs(query, storeCountry)),
        ),
      );

      const fallbackTracks = fallbackResults
        .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
        .map((track) => {
          const fallbackAlbumScore = albumScore(track, context);
          const score = trackScore(
            track,
            new Map([[String(track.collectionId), fallbackAlbumScore]]),
            context,
          );
          return normalizeTrack(track, {
            score,
            source: fallbackAlbumScore >= OFFICIAL_ALBUM_THRESHOLD ? "iTunes" : "iTunes Search",
            sourceQuery: track.sourceQuery || "",
          });
        })
        .filter(
          (track) =>
            track.previewUrl &&
            track.trackName &&
            track.score >= DIRECT_TRACK_THRESHOLD &&
            !containsAny(
              normalizeText(
                `${track.trackName} ${track.artistName} ${track.collectionName}`,
              ),
              BAD_MATCH_WORDS,
            ),
        );

      tracks = [...tracks, ...fallbackTracks];
    }

    const normalizedTracks = dedupeTracks(tracks)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_TRACKS)
      .map(toPublicTrack);

    return NextResponse.json(
      {
        source: "itunes",
        query: albumQueries[0],
        spotifyConfigured: Boolean(getSpotifyCredentials()),
        spotifyPlaylists: spotifyResult.playlists.map((playlist) => ({
          id: playlist.id,
          name: playlist.name,
          owner: playlist.owner?.display_name || "",
          total: Number(playlist.tracks?.total || 0),
          score: playlist.score,
          url: playlist.external_urls?.spotify || "",
        })),
        albums: rankedAlbums.map((album) => ({
          id: String(album.collectionId),
          name: album.collectionName,
          artist: album.artistName,
          score: album.score,
          releaseDate: album.releaseDate || null,
        })),
        tracks: normalizedTracks,
      },
      {
        headers: {
          "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "No se pudo resolver el soundtrack" },
      { status: 502 },
    );
  }
}
