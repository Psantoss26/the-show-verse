function toPositiveInteger(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

function getSeasonNumber(season) {
  return toPositiveInteger(
    season?.season_number ?? season?.seasonNumber ?? season?.number,
  );
}

function getEpisodeNumber(episode) {
  return toPositiveInteger(
    episode?.episode_number ?? episode?.episodeNumber ?? episode?.number,
  );
}

function getSourceEpisodeNumber(episode) {
  return toPositiveInteger(
    episode?.sourceEpisodeNumber ??
      episode?.episode_number ??
      episode?.episodeNumber ??
      episode?.number,
  );
}

export function getVisualEpisodeNumber({
  source,
  episode,
  episodeIndex,
} = {}) {
  const sourceEpisodeNumber = getEpisodeNumber(episode);
  if (source === "seriesgraph") {
    return toPositiveInteger(Number(episodeIndex) + 1);
  }
  return sourceEpisodeNumber;
}

export function seasonStructuresAlign(ratingSeasons, tmdbSeasons) {
  const ratings = (Array.isArray(ratingSeasons) ? ratingSeasons : [])
    .map((season) => {
      const seasonNumber = getSeasonNumber(season);
      const episodeCount = Array.isArray(season?.episodes)
        ? season.episodes.length
        : toPositiveInteger(season?.episodeCount);
      if (!seasonNumber || !episodeCount) return null;
      return { seasonNumber, episodeCount };
    })
    .filter(Boolean)
    .sort((a, b) => a.seasonNumber - b.seasonNumber);

  const tmdb = (Array.isArray(tmdbSeasons) ? tmdbSeasons : [])
    .map((season) => {
      const seasonNumber = getSeasonNumber(season);
      const episodeCount = toPositiveInteger(
        season?.episode_count ?? season?.episodeCount,
      );
      if (!seasonNumber || !episodeCount) return null;
      return { seasonNumber, episodeCount };
    })
    .filter(Boolean)
    .sort((a, b) => a.seasonNumber - b.seasonNumber);

  if (!ratings.length || ratings.length !== tmdb.length) return false;

  return ratings.every(
    (season, index) =>
      season.seasonNumber === tmdb[index].seasonNumber &&
      season.episodeCount === tmdb[index].episodeCount,
  );
}

export function getDirectEpisodeTarget(
  tmdbSeasons,
  seasonNumber,
  episodeNumber,
) {
  const targetSeason = toPositiveInteger(seasonNumber);
  const targetEpisode = toPositiveInteger(episodeNumber);
  if (!targetSeason || !targetEpisode) return null;

  const season = (Array.isArray(tmdbSeasons) ? tmdbSeasons : []).find(
    (candidate) => getSeasonNumber(candidate) === targetSeason,
  );
  const episodeCount = toPositiveInteger(
    season?.episode_count ?? season?.episodeCount,
  );

  if (!episodeCount || targetEpisode > episodeCount) return null;

  return {
    seasonNumber: targetSeason,
    episodeNumber: targetEpisode,
  };
}

export function getVisualEpisodeOrdinal(
  ratingSeasons,
  seasonNumber,
  episodeNumber,
  sourceEpisodeNumber,
) {
  const targetSeason = toPositiveInteger(seasonNumber);
  const visualEpisode = toPositiveInteger(episodeNumber);
  if (!targetSeason || !visualEpisode) return null;

  const seasons = (Array.isArray(ratingSeasons) ? ratingSeasons : [])
    .map((season) => ({
      seasonNumber: getSeasonNumber(season),
      episodes: Array.isArray(season?.episodes) ? season.episodes : [],
    }))
    .filter((season) => season.seasonNumber)
    .sort((a, b) => a.seasonNumber - b.seasonNumber);

  // Una única temporada visual representa una secuencia absoluta. En ese
  // formato la posición mostrada (E839) es la identidad elegida por el usuario,
  // aunque la fuente tenga huecos y el episodio subyacente se numere como 847.
  let ordinal =
    seasons.length === 1
      ? visualEpisode
      : (toPositiveInteger(sourceEpisodeNumber) ?? visualEpisode);

  for (const season of seasons) {
    if (season.seasonNumber >= targetSeason) break;

    const maxEpisode = season.episodes.reduce((max, episode) => {
      const number = getSourceEpisodeNumber(episode);
      return number ? Math.max(max, number) : max;
    }, 0);

    ordinal += maxEpisode || season.episodes.length;
  }

  return ordinal;
}

export function mapRatingEpisodesByTmdbOrdinal(ratingSeasons, tmdbSeasons) {
  const ratings = (Array.isArray(ratingSeasons) ? ratingSeasons : [])
    .map((season) => ({
      seasonNumber: getSeasonNumber(season),
      episodes: Array.isArray(season?.episodes)
        ? [...season.episodes].sort(
            (a, b) => (getEpisodeNumber(a) || 0) - (getEpisodeNumber(b) || 0),
          )
        : [],
    }))
    .filter((season) => season.seasonNumber && season.episodes.length)
    .sort((a, b) => a.seasonNumber - b.seasonNumber);

  const tmdb = (Array.isArray(tmdbSeasons) ? tmdbSeasons : [])
    .map((season) => ({
      seasonNumber: getSeasonNumber(season),
      episodeCount: toPositiveInteger(
        season?.episode_count ?? season?.episodeCount ?? season?.count,
      ),
    }))
    .filter((season) => season.seasonNumber && season.episodeCount)
    .sort((a, b) => a.seasonNumber - b.seasonNumber);

  const episodes = ratings.flatMap((season) => season.episodes);
  const result = new Map();
  let offset = 0;

  for (const season of tmdb) {
    const end = offset + season.episodeCount;
    result.set(season.seasonNumber, episodes.slice(offset, end));
    offset = end;
  }

  return result;
}
