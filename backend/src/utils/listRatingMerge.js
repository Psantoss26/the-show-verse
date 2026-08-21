function validScore(value) {
  const score = Number(value);
  return Number.isFinite(score) && score > 0 && score <= 10 ? score : null;
}

function itemKey(item) {
  const mediaType = item?.mediaType === 'tv' ? 'tv' : 'movie';
  const tmdbId = Number(item?.tmdbId);
  return Number.isInteger(tmdbId) && tmdbId > 0 ? `${mediaType}:${tmdbId}` : null;
}

/**
 * Copia las puntuaciones ya resueltas a la página visible de la lista. Ambas
 * colecciones vienen de la misma consulta: una sirve para la media global y la
 * otra conserva los datos de presentación (como el poster) del grid.
 */
export function mergeListItemRatings(items = [], ratedItems = []) {
  const ratingsByKey = new Map();

  for (const item of Array.isArray(ratedItems) ? ratedItems : []) {
    const key = itemKey(item);
    const score = validScore(item?.voteAverage);
    if (key && score != null) ratingsByKey.set(key, score);
  }

  return (Array.isArray(items) ? items : []).map((item) => {
    const score = ratingsByKey.get(itemKey(item));
    return score == null ? item : { ...item, voteAverage: score };
  });
}
