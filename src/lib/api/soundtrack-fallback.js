import { norm } from "@/lib/api/soundtrack-utils";
import { searchITunes } from "@/lib/api/itunes";
import { searchDeezer } from "@/lib/api/deezer";

const MIN_TRACKS_TO_STOP = 4;

export async function searchFallback(ctx, country = "US") {
  let tracks = [];
  let source = null;
  let query = "";

  const itunesResult = await searchITunes(ctx, country);
  if (itunesResult.tracks.length >= MIN_TRACKS_TO_STOP) {
    return {
      tracks: itunesResult.tracks,
      source: "iTunes",
      query: itunesResult.query || query,
    };
  }

  if (itunesResult.tracks.length > 0) {
    tracks = itunesResult.tracks;
    source = "iTunes";
    query = itunesResult.query;
  }

  const deezerResult = await searchDeezer(ctx);
  if (deezerResult.tracks.length > 0) {
    const merged = [...tracks];
    for (const dt of deezerResult.tracks) {
      const isDuplicate = merged.some(
        (t) =>
          norm(t.trackName) === norm(dt.trackName) &&
          norm(t.artistName) === norm(dt.artistName),
      );
      if (!isDuplicate) merged.push(dt);
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
