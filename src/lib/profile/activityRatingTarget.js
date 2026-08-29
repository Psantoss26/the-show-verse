function wholeNumber(value, { min = 0 } = {}) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min ? number : null;
}

function ratingTarget(item) {
  const target = item?.ratingTarget || item?.ratedMediaType;
  const season = wholeNumber(item?.season ?? item?.seasonNumber ?? item?.season_number);
  const episode = wholeNumber(item?.episode ?? item?.episodeNumber ?? item?.episode_number);

  if (target === "episode" || (season != null && episode != null)) {
    return { kind: "episode", season, episode };
  }
  if (target === "season" || season != null) {
    return { kind: "season", season };
  }
  return {
    kind: ["tv", "show", "season", "episode"].includes(item?.mediaType)
      ? "series"
      : "movie",
  };
}

function episodeCode(season, episode) {
  if (season == null || episode == null) return "un episodio de";
  return `el episodio S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")} de`;
}

export function formatActivityRatingTarget(item) {
  const target = ratingTarget(item);
  if (target.kind === "episode") {
    return episodeCode(target.season, target.episode);
  }
  if (target.kind === "season") {
    return target.season == null ? "una temporada de" : `la temporada ${target.season} de`;
  }
  return target.kind === "series" ? "la serie" : "la película";
}

export function getActivityDetailsHref(item) {
  const tmdbId = Number(item?.tmdbId);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return null;

  // El feed usa estos mismos campos tanto al puntuar como al registrar un
  // visionado. Si hay identidad de episodio o temporada, el destino debe ser
  // su ficha concreta, no la ficha genérica de la serie.
  const target = ratingTarget(item);
  if (target.kind === "episode" && target.season != null && target.episode != null) {
    return `/details/tv/${tmdbId}/season/${target.season}/episode/${target.episode}`;
  }
  if (target.kind === "season" && target.season != null) {
    return `/details/tv/${tmdbId}/season/${target.season}`;
  }

  return `/details/${target.kind === "series" ? "tv" : "movie"}/${tmdbId}`;
}
