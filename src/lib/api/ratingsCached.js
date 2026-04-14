import { unstable_cache } from "next/cache";
import {
  getEpisodeImdbRating,
  getEpisodeRatings,
  getSeasonImdbAggregate,
} from "@/lib/api/ratingsHelper";

function buildSeasonAggregateFromRatings(ratingsData, seasonNumber, imdbId) {
  const targetSeason = ratingsData?.seasons?.find(
    (s) => s.seasonNumber === Number(seasonNumber),
  );

  if (!targetSeason?.episodes?.length) return null;

  const imdbRatings = targetSeason.episodes
    .map((ep) => ep.imdb)
    .filter((r) => typeof r === "number" && r > 0);

  const imdbVotes = targetSeason.episodes
    .map((ep) => ep.imdbVotes)
    .filter((v) => typeof v === "number" && v > 0);

  if (!imdbRatings.length) return null;

  return {
    id: imdbId,
    rating: Number(
      (imdbRatings.reduce((a, b) => a + b, 0) / imdbRatings.length).toFixed(1),
    ),
    votes: imdbVotes.length
      ? imdbVotes.reduce((a, b) => a + b, 0)
      : null,
  };
}

function buildEpisodeRatingFromRatings(
  ratingsData,
  seasonNumber,
  episodeNumber,
  imdbId,
) {
  const targetSeason = ratingsData?.seasons?.find(
    (s) => s.seasonNumber === Number(seasonNumber),
  );
  const targetEpisode = targetSeason?.episodes?.find(
    (ep) => ep.episodeNumber === Number(episodeNumber),
  );

  if (!targetEpisode) return null;

  return {
    id: imdbId,
    rating:
      typeof targetEpisode.imdb === "number" ? targetEpisode.imdb : null,
    votes:
      typeof targetEpisode.imdbVotes === "number"
        ? targetEpisode.imdbVotes
        : null,
  };
}

const getCachedEpisodeRatings = unstable_cache(
  async (showId, excludeSpecials = true) => {
    return getEpisodeRatings(Number(showId), Boolean(excludeSpecials));
  },
  ["tv-episode-ratings"],
  { revalidate: 3600 },
);

const getCachedSeasonImdbDataInternal = unstable_cache(
  async (showId, imdbId, seasonNumber) => {
    if (!imdbId) return null;

    const aggregate = await getSeasonImdbAggregate(imdbId, Number(seasonNumber));
    if (aggregate) return aggregate;

    const ratingsData = await getCachedEpisodeRatings(String(showId), true);
    return buildSeasonAggregateFromRatings(ratingsData, seasonNumber, imdbId);
  },
  ["season-imdb-aggregate"],
  { revalidate: 3600 },
);

const getCachedEpisodeImdbDataInternal = unstable_cache(
  async (showId, imdbId, seasonNumber, episodeNumber) => {
    if (!imdbId) return null;

    const rating = await getEpisodeImdbRating(
      imdbId,
      Number(seasonNumber),
      Number(episodeNumber),
    );
    if (rating?.rating) return rating;

    const ratingsData = await getCachedEpisodeRatings(String(showId), true);
    return buildEpisodeRatingFromRatings(
      ratingsData,
      seasonNumber,
      episodeNumber,
      imdbId,
    );
  },
  ["episode-imdb-rating"],
  { revalidate: 3600 },
);

export async function getCachedSeasonImdbData({
  showId,
  imdbId,
  seasonNumber,
} = {}) {
  return getCachedSeasonImdbDataInternal(
    String(showId || ""),
    String(imdbId || ""),
    String(seasonNumber || ""),
  );
}

export async function getCachedEpisodeImdbData({
  showId,
  imdbId,
  seasonNumber,
  episodeNumber,
} = {}) {
  return getCachedEpisodeImdbDataInternal(
    String(showId || ""),
    String(imdbId || ""),
    String(seasonNumber || ""),
    String(episodeNumber || ""),
  );
}

