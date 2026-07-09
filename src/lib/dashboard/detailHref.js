import { getMediaTypeForItem } from "./media.js";

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getEpisodeRef(item) {
  const nextEpisode = item?.nextEpisode || null;
  const season =
    toFiniteNumber(nextEpisode?.season) ??
    toFiniteNumber(nextEpisode?.season_number) ??
    toFiniteNumber(nextEpisode?.seasonNumber) ??
    toFiniteNumber(item?.season) ??
    toFiniteNumber(item?.season_number) ??
    toFiniteNumber(item?.seasonNumber);
  const episode =
    toFiniteNumber(nextEpisode?.number) ??
    toFiniteNumber(nextEpisode?.episode) ??
    toFiniteNumber(nextEpisode?.episode_number) ??
    toFiniteNumber(nextEpisode?.episodeNumber) ??
    toFiniteNumber(item?.episode_number) ??
    toFiniteNumber(item?.episodeNumber) ??
    (typeof item?.episode === "object" ? null : toFiniteNumber(item?.episode));

  if (season == null || season < 0 || episode == null || episode <= 0) {
    return null;
  }

  return { season, episode };
}

export function dashboardDetailHref(item, mediaType = getMediaTypeForItem(item)) {
  if (typeof item?.detailsHref === "string" && item.detailsHref.startsWith("/details/")) {
    return item.detailsHref;
  }

  const id = item?.id ?? item?.tmdbId ?? item?.tmdb_id;
  if (!id) return "/";

  if (mediaType === "movie") {
    return `/details/movie/${id}`;
  }

  const episodeRef = getEpisodeRef(item);
  if (episodeRef) {
    return `/details/tv/${id}/season/${episodeRef.season}/episode/${episodeRef.episode}`;
  }

  return `/details/tv/${id}`;
}
