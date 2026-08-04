function positiveScore(value) {
  const score = Number(value);
  return Number.isFinite(score) && score > 0 ? score : null;
}

export function resolveListItemIndicator({
  mediaType,
  favorite = false,
  watchlist = false,
  watched = false,
  plays = 0,
  userRating = null,
  tmdbRating = null,
  imdbRating = null,
} = {}) {
  const normalizedType = mediaType === "tv" ? "tv" : "movie";

  if (favorite) {
    const rating = positiveScore(userRating);
    const moviePlays = Math.max(
      0,
      Number.isFinite(Number(plays)) ? Number(plays) : 0,
    );

    return {
      leading: "favorite",
      ...(normalizedType === "movie"
        ? { watched: { kind: "count", value: moviePlays } }
        : watched
          ? { watched: { kind: "watched" } }
          : {}),
      ...(rating !== null ? { rating: { kind: "user", value: rating } } : {}),
    };
  }

  const tmdb = positiveScore(tmdbRating);
  const imdb = positiveScore(imdbRating);

  return {
    leading: watchlist ? "watchlist" : normalizedType,
    ...(tmdb !== null ? { tmdbRating: tmdb } : {}),
    ...(imdb !== null ? { imdbRating: imdb } : {}),
  };
}
