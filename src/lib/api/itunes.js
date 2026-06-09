import {
  norm, tokens, sigTokens, containsAny, bestTitleScore,
  yearScore, soundtrackBonus, sleep,
} from "@/lib/api/soundtrack-utils";

const ITUNES_SEARCH_URL = "https://itunes.apple.com/search";
const ITUNES_LOOKUP_URL = "https://itunes.apple.com/lookup";
const MAX_TRACKS = 40;
const MAX_ALBUMS = 4;
const ALBUM_MIN_SCORE = 26;
const TRACK_MIN_SCORE = 18;
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
  const primary = ctx.titles[0] ?? "";
  const alt = ctx.titles[1];
  const qs = [];

  if (primary) {
    qs.push(`${primary} soundtrack`);
    qs.push(primary);
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
  const name = album.collectionName ?? album.collectionCensoredName ?? "";
  const artist = album.artistName ?? "";
  const text = norm(`${name} ${artist}`);

  let s = bestTitleScore(name, ctx.titles);

  if (ctx.originalTitle) {
    const os = bestTitleScore(name, [ctx.originalTitle]);
    if (os >= 70) s += 16;
    else if (os >= 50) s += 8;
  }

  s += soundtrackBonus(text);

  if (album.primaryGenreName?.toLowerCase().includes("soundtrack")) s += 20;
  if (/motion picture|television|series|movie|film/.test(text)) s += 10;

  if (ctx.mediaType === "tv" && /series|show|season|episode|tv|television/.test(text)) s += 8;
  if (ctx.mediaType === "movie" && /movie|film|motion picture/.test(text)) s += 8;
  if (ctx.mediaType === "tv" && /movie|film/.test(text) && !/series|show|season|episode|tv|television/.test(text)) s -= 12;
  if (ctx.mediaType === "movie" && /series|season|episode|tv|television/.test(text) && !/movie|film|motion picture/.test(text)) s -= 12;
  if (/original|official/.test(text)) s += 6;

  s += yearScore(album.releaseDate, ctx.year, ctx.mediaType);

  const total = Number(album.trackCount ?? 0);
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
    "david wise", "jeremy soule", "marty o donnell", "marcin przybyłowicz",
    "christophe beck", "henry jackman", "steve jablonsky", "brian tyler",
    "joe hisaishi", "yann tiersen", "michael nyman", "philip glass",
    "mychael danna", "nicholas britell", "daniel pemberton",
  ];
  if (knownComposers.some((c) => norm(artist).includes(c))) s += 10;

  return Math.round(s);
}

function scoreTrackItem(track, ctx) {
  const name = track.trackName ?? track.trackCensoredName ?? "";
  const artist = track.artistName ?? "";
  const albumName = track.collectionName ?? "";
  const text = norm(`${name} ${artist} ${albumName}`);

  let s = bestTitleScore(name, ctx.titles);

  if (containsAny(text, ["soundtrack", "ost", "score", "theme", "song", "music"])) s += 20;
  if (containsAny(text, ["karaoke", "tribute", "cover", "remix", "lullaby", "lofi"])) s -= 50;

  if (track.primaryGenreName?.toLowerCase().includes("soundtrack")) s += 15;

  if (albumName) {
    const albumScore = bestTitleScore(albumName, ctx.titles);
    s += Math.round(albumScore * 0.4);
    const albumText = norm(albumName);
    if (containsAny(albumText, ["soundtrack", "ost", "score", "music from"])) s += 12;
  }

  return Math.round(s);
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

async function searchTracks(query, country) {
  const url = `${ITUNES_SEARCH_URL}?${new URLSearchParams({
    term: query,
    media: "music",
    entity: "musicTrack",
    limit: "25",
    country,
  })}`;
  const data = await fetchJson(url);
  return (Array.isArray(data?.results) ? data.results : [])
    .filter((r) => r.wrapperType === "track" && r.kind === "song");
}

export async function searchITunes(ctx, country = "US") {
  const queries = buildQueries(ctx);
  let allTracks = [];
  let usedQuery = "";
  let scoreFallbackTracks = [];

  for (let qi = 0; qi < queries.length; qi++) {
    const q = queries[qi];
    let albums;

    try {
      albums = await searchAlbums(q, country);
    } catch {
      continue;
    }

    if (!usedQuery) usedQuery = q;

    const scoredAlbums = albums
      .map((a) => ({ ...a, _score: scoreAlbum(a, ctx) }))
      .filter((a) => a._score >= ALBUM_MIN_SCORE)
      .sort((a, b) => b._score - a._score)
      .slice(0, MAX_ALBUMS);

    if (scoredAlbums.length > 0) {
      for (const album of scoredAlbums) {
        try {
          const tracks = await lookupAlbumTracks(album.collectionId, country);
          for (const t of tracks) {
            allTracks.push(normalizeTrack(t, album));
          }
        } catch {
          continue;
        }
      }

      if (allTracks.length >= 5) break;
    }

    if (qi >= 1 && allTracks.length < 3 && scoredAlbums.length < 2) {
      try {
        const tracks = await searchTracks(q, country);
        for (const t of tracks) {
          if (scoreTrackItem(t, ctx) >= TRACK_MIN_SCORE) {
            const albumInfo = {
              collectionName: t.collectionName ?? "",
              collectionViewUrl: t.collectionViewUrl ?? "",
              artworkUrl100: t.artworkUrl100 ?? "",
            };
            scoreFallbackTracks.push(normalizeTrack(t, albumInfo));
          }
        }
      } catch {}
    }

    if (qi < queries.length - 1) await sleep(200);
  }

  const all = [...allTracks, ...scoreFallbackTracks];
  const deduped = dedupeTracks(all);
  return {
    tracks: deduped.slice(0, MAX_TRACKS),
    query: usedQuery,
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
