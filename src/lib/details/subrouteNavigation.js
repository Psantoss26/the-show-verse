function validNumber(value, { min = 0 } = {}) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min ? number : null;
}

function seasonHref(showId, seasonNumber) {
  return `/details/tv/${showId}/season/${seasonNumber}`;
}

function episodeHref(showId, seasonNumber, episodeNumber) {
  return `${seasonHref(showId, seasonNumber)}/episode/${episodeNumber}`;
}

export function getAdjacentSeasonHrefs(showId, currentSeason, seasons = []) {
  const validShowId = validNumber(showId, { min: 1 });
  const current = validNumber(currentSeason);
  if (validShowId == null || current == null) {
    return { previousHref: null, nextHref: null };
  }

  const numbers = [...new Set(
    seasons
      .map((season) => validNumber(season?.season_number ?? season?.seasonNumber))
      .filter((number) => number != null),
  )].sort((a, b) => a - b);
  const index = numbers.indexOf(current);
  if (index < 0) return { previousHref: null, nextHref: null };

  return {
    previousHref: index > 0 ? seasonHref(validShowId, numbers[index - 1]) : null,
    nextHref: index < numbers.length - 1 ? seasonHref(validShowId, numbers[index + 1]) : null,
  };
}

export function getAdjacentEpisodeHrefs(
  showId,
  seasonNumber,
  currentEpisode,
  episodes = [],
) {
  const validShowId = validNumber(showId, { min: 1 });
  const season = validNumber(seasonNumber);
  const current = validNumber(currentEpisode, { min: 1 });
  if (validShowId == null || season == null || current == null) {
    return { previousHref: null, nextHref: null };
  }

  const numbers = [...new Set(
    episodes
      .map((episode) => validNumber(episode?.episode_number ?? episode?.episodeNumber, { min: 1 }))
      .filter((number) => number != null),
  )].sort((a, b) => a - b);
  const index = numbers.indexOf(current);
  if (index < 0) return { previousHref: null, nextHref: null };

  return {
    previousHref: index > 0
      ? episodeHref(validShowId, season, numbers[index - 1])
      : null,
    nextHref: index < numbers.length - 1
      ? episodeHref(validShowId, season, numbers[index + 1])
      : null,
  };
}
