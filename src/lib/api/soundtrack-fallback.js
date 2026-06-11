import { norm } from "@/lib/api/soundtrack-utils";
import { searchITunes } from "@/lib/api/itunes";
import { searchDeezer } from "@/lib/api/deezer";

const MIN_TRACKS_TO_STOP = 4;

function isSameTrack(a, b) {
  const aName = norm(a.trackName);
  const bName = norm(b.trackName);
  if (!aName || aName !== bName) return false;

  const aArtist = norm(a.artistName);
  const bArtist = norm(b.artistName);
  if (!aArtist || !bArtist) return true;
  if (aArtist === bArtist) return true;

  const aTokens = new Set(aArtist.split(" ").filter((t) => t.length > 2));
  const bTokens = bArtist.split(" ").filter((t) => t.length > 2);
  return bTokens.some((token) => aTokens.has(token));
}

export async function searchFallback(ctx, country = "US", options = {}) {
  let tracks = [];
  let source = null;
  let query = "";

  const itunesResult = await searchITunes(ctx, country, {
    strictSoundtrackAlbums: Boolean(options.appleOnly),
  });
  if (itunesResult.tracks.length > 0) {
    tracks = itunesResult.tracks;
    source = "iTunes";
    query = itunesResult.query;
  }

  if (options.appleOnly) {
    return tracks.length > 0
      ? { tracks, source: source ?? "iTunes", query }
      : { tracks: [], source: null, query };
  }

  const deezerResult = await searchDeezer(ctx);
  if (deezerResult.tracks.length > 0) {
    const merged = [...tracks];
    for (const dt of deezerResult.tracks) {
      const matchIdx = merged.findIndex((t) => isSameTrack(t, dt));
      if (matchIdx === -1) {
        merged.push(dt);
      } else {
        const current = merged[matchIdx];
        const deezerHasPreview = Boolean(dt.previewUrl);
        const currentHasPreview = Boolean(current.previewUrl);
        if (
          (deezerHasPreview && !currentHasPreview) ||
          ((dt.score ?? 0) > (current.score ?? 0) &&
            deezerHasPreview === currentHasPreview)
        ) {
          merged[matchIdx] = { ...current, ...dt };
        }
      }
    }

    const totalTracks = merged.length;
    const itunesCount = tracks.length;
    const deezerCount = deezerResult.tracks.length;

    if (itunesCount === 0 || deezerCount > itunesCount) {
      source = deezerResult.tracks.length > itunesCount ? "Deezer" : source;
    }

    tracks = merged;
    query = query || deezerResult.query;

    if (totalTracks >= MIN_TRACKS_TO_STOP && source) {
      return { tracks, source, query };
    }
  }

  if (tracks.length > 0) {
    return { tracks, source: source ?? "fallback", query };
  }

  return { tracks: [], source: null, query: "" };
}
