export const COMMUNITY_IMDB_SUMMARY_SAMPLE_SIZE = 120;

function itemKey(item) {
  const tmdbId = Number(item?.tmdbId);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return null;

  const mediaType = item?.mediaType === 'tv' || item?.mediaType === 'show'
    ? 'tv'
    : item?.mediaType === 'movie'
      ? 'movie'
      : null;

  return mediaType ? `${mediaType}:${tmdbId}` : null;
}

/**
 * Devuelve una muestra estable y repartida de identificadores para enriquecer
 * la media IMDb. No incluye posters ni el resto de los datos de presentación,
 * por lo que no altera la paginación del grid de listas comunitarias.
 */
export function selectCommunityImdbSummarySample(
  items = [],
  limit = COMMUNITY_IMDB_SUMMARY_SAMPLE_SIZE,
) {
  const unique = [];
  const seen = new Set();

  for (const item of Array.isArray(items) ? items : []) {
    const key = itemKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push({
      tmdbId: Number(item.tmdbId),
      mediaType: item.mediaType === 'tv' || item.mediaType === 'show' ? 'tv' : 'movie',
    });
  }

  const safeLimit = Math.min(
    Math.max(1, Number(limit) || COMMUNITY_IMDB_SUMMARY_SAMPLE_SIZE),
    COMMUNITY_IMDB_SUMMARY_SAMPLE_SIZE,
  );
  if (unique.length <= safeLimit) return unique;
  if (safeLimit === 1) return [unique[0]];

  return Array.from({ length: safeLimit }, (_, index) => {
    const position = Math.round((index * (unique.length - 1)) / (safeLimit - 1));
    return unique[position];
  });
}
