// src/lib/details/seriesGraphRatings.js
import { slugifyForSeriesGraph } from "@/lib/details/formatters";

const ratingsCache = new Map();
const ratingsInflight = new Map();

function toRatingNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toVoteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

function getSeasonNumber(season) {
  const parsed = Number(
    season?.season_number ?? season?.seasonNumber ?? season?.number,
  );
  return Number.isFinite(parsed) ? parsed : null;
}

function getEpisodeNumber(episode) {
  const parsed = Number(
    episode?.episode_number ?? episode?.episodeNumber ?? episode?.number,
  );
  return Number.isFinite(parsed) ? parsed : null;
}

function getSeriesGraphRating(episode) {
  return toRatingNumber(
    episode?.seriesGraphRating ??
      episode?.seriesgraphRating ??
      episode?.series_graph_rating ??
      episode?.rating ??
      episode?.vote_average,
  );
}

function getSeriesGraphVotes(episode) {
  return toVoteNumber(
    episode?.seriesGraphVotes ??
      episode?.seriesgraphVotes ??
      episode?.series_graph_votes ??
      episode?.votes ??
      episode?.vote_count ??
      episode?.num_votes,
  );
}

function buildSeriesGraphUrl(showId, title) {
  const slug = slugifyForSeriesGraph(title || "");
  return `https://seriesgraph.com/show/${encodeURIComponent(String(showId))}${
    slug ? `-${slug}` : ""
  }`;
}

function getNormalizedRatingSeasons(ratings) {
  return (
    Array.isArray(ratings?.seasons)
      ? ratings.seasons
      : Array.isArray(ratings)
        ? ratings
        : []
  )
    .map((season) => {
      const seasonNumber = getSeasonNumber(season);
      const episodes = Array.isArray(season?.episodes) ? season.episodes : [];
      if (!Number.isFinite(seasonNumber) || seasonNumber <= 0) return null;
      if (!episodes.length) return null;
      return { season, seasonNumber, episodes };
    })
    .filter(Boolean)
    .sort((a, b) => a.seasonNumber - b.seasonNumber);
}

function getTmdbEpisodeOrdinal(tmdbSeasons, seasonNumber, episodeNumber) {
  const targetSeasonNumber = Number(seasonNumber);
  const targetEpisodeNumber = Number(episodeNumber);
  if (
    !Number.isFinite(targetSeasonNumber) ||
    !Number.isFinite(targetEpisodeNumber) ||
    targetSeasonNumber <= 0 ||
    targetEpisodeNumber <= 0
  ) {
    return null;
  }

  const seasons = (Array.isArray(tmdbSeasons) ? tmdbSeasons : [])
    .map((season) => {
      const number = Number(season?.season_number ?? season?.seasonNumber);
      const count = Number(season?.episode_count ?? season?.episodeCount);
      if (!Number.isFinite(number) || number <= 0) return null;
      if (!Number.isFinite(count) || count <= 0) return null;
      return { number, count };
    })
    .filter(Boolean)
    .sort((a, b) => a.number - b.number);

  if (!seasons.length) return null;

  let ordinal = targetEpisodeNumber;
  for (const season of seasons) {
    if (season.number >= targetSeasonNumber) break;
    ordinal += season.count;
  }

  return ordinal;
}

function mapTmdbRouteToRatingsEpisode({
  ratings,
  tmdbSeasons,
  seasonNumber,
  episodeNumber,
} = {}) {
  const seasons = getNormalizedRatingSeasons(ratings);
  if (!seasons.length) return null;

  const directSeasonNumber = Number(seasonNumber);
  const directEpisodeNumber = Number(episodeNumber);
  const directSeason = seasons.find(
    (season) => season.seasonNumber === directSeasonNumber,
  );
  const directEpisode = directSeason?.episodes.find(
    (episode) => getEpisodeNumber(episode) === directEpisodeNumber,
  );
  if (directEpisode) {
    return {
      season: directSeason.season,
      episode: directEpisode,
      seasonNumber: directSeasonNumber,
      episodeNumber: directEpisodeNumber,
    };
  }

  const ordinal = getTmdbEpisodeOrdinal(
    tmdbSeasons,
    seasonNumber,
    episodeNumber,
  );
  if (!Number.isFinite(ordinal) || ordinal <= 0) return null;

  let remaining = ordinal;
  for (const season of seasons) {
    const sortedEpisodes = [...season.episodes].sort(
      (a, b) => (getEpisodeNumber(a) || 0) - (getEpisodeNumber(b) || 0),
    );
    if (remaining <= sortedEpisodes.length) {
      const episode = sortedEpisodes[remaining - 1];
      return {
        season: season.season,
        episode,
        seasonNumber: season.seasonNumber,
        episodeNumber: getEpisodeNumber(episode),
      };
    }
    remaining -= sortedEpisodes.length;
  }

  return null;
}

export async function fetchSeriesGraphRatingsCached({
  showId,
  title,
  signal,
} = {}) {
  if (!showId) return null;

  const key = String(showId);
  if (ratingsCache.has(key)) return ratingsCache.get(key);
  if (ratingsInflight.has(key)) return ratingsInflight.get(key);

  const params = new URLSearchParams({ tmdbId: key });
  if (title) params.set("title", title);

  const promise = fetch(`/api/seriesgraph/episode-ratings?${params}`, {
    cache: "force-cache",
    signal,
  })
    .then(async (res) => {
      const json = await res.json().catch(() => null);
      const value = res.ok ? json : null;
      if (value) ratingsCache.set(key, value);
      return value;
    })
    .catch((error) => {
      if (error?.name === "AbortError") throw error;
      return null;
    })
    .finally(() => {
      ratingsInflight.delete(key);
    });

  ratingsInflight.set(key, promise);
  return promise;
}

export function getSeriesGraphSeasonAggregate({
  ratings,
  seasonNumber,
  showId,
  title,
} = {}) {
  const targetSeasonNumber = Number(seasonNumber);
  if (!Number.isFinite(targetSeasonNumber) || targetSeasonNumber <= 0) {
    return null;
  }

  const seasons = getNormalizedRatingSeasons(ratings);
  const seasonWrapper = seasons.find(
    (item) => item.seasonNumber === targetSeasonNumber,
  );
  const season = seasonWrapper?.season;
  const episodes = Array.isArray(season?.episodes) ? season.episodes : [];
  const values = episodes
    .map((episode) => getSeriesGraphRating(episode))
    .filter((rating) => rating != null);

  if (!values.length) return null;

  const voteTotal = episodes.reduce(
    (sum, episode) => sum + (getSeriesGraphVotes(episode) || 0),
    0,
  );
  const rating = values.reduce((sum, value) => sum + value, 0) / values.length;

  return {
    id: null,
    rating: Number(rating.toFixed(1)),
    votes: voteTotal > 0 ? voteTotal : null,
    source: "seriesgraph",
    url: ratings?.meta?.providerUrl || buildSeriesGraphUrl(showId, title),
  };
}

export function getSeriesGraphEpisodeRating({
  ratings,
  seasonNumber,
  episodeNumber,
  tmdbSeasons,
  showId,
  title,
} = {}) {
  const targetSeasonNumber = Number(seasonNumber);
  const targetEpisodeNumber = Number(episodeNumber);
  if (
    !Number.isFinite(targetSeasonNumber) ||
    !Number.isFinite(targetEpisodeNumber)
  ) {
    return null;
  }

  const resolved = mapTmdbRouteToRatingsEpisode({
    ratings,
    tmdbSeasons,
    seasonNumber: targetSeasonNumber,
    episodeNumber: targetEpisodeNumber,
  });
  const episode = resolved?.episode || null;
  const rating = getSeriesGraphRating(episode);
  if (rating == null) return null;

  return {
    id: episode?.tconst || null,
    rating,
    votes: getSeriesGraphVotes(episode),
    source: "seriesgraph",
    url: ratings?.meta?.providerUrl || buildSeriesGraphUrl(showId, title),
    seasonNumber: resolved?.seasonNumber ?? targetSeasonNumber,
    episodeNumber: resolved?.episodeNumber ?? targetEpisodeNumber,
  };
}
