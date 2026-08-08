function normalizeImdbRating(value) {
  const rating = Number(value);
  return Number.isFinite(rating) && rating > 0 ? rating : null;
}

/**
 * Compara dos puntuaciones IMDb manteniendo los títulos sin puntuación al final
 * tanto en orden ascendente como descendente. Cuando ambas faltan (o empatan),
 * devuelve 0 para conservar el orden estable que ya tenía la lista.
 */
export function compareImdbRatings(aValue, bValue, direction = "desc") {
  const a = normalizeImdbRating(aValue);
  const b = normalizeImdbRating(bValue);

  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  return direction === "asc" ? a - b : b - a;
}
