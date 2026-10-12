// src/lib/letterboxdImport.js
// Importación de Letterboxd: visionados y puntuaciones de películas ya
// resueltas a TMDb (la resolución la hace el front, /api/letterboxd/import).

function validDate(value, fallback = null) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function movieId(item) {
  const tmdbId = Number(item?.tmdbId);
  return Number.isInteger(tmdbId) && tmdbId > 0 ? tmdbId : null;
}

/** Visionado → fila de watch_history (o null si no vale). */
export function mapLetterboxdHistoryItem(item, userId) {
  const tmdbId = movieId(item);
  const watchedAt = validDate(item?.watchedAt);
  if (!tmdbId || !watchedAt) return null;
  return {
    userId,
    tmdbId,
    mediaType: 'movie',
    season: null,
    episode: null,
    watchedAt,
    runtimeMins: null,
    title: item?.title || null,
    posterPath: item?.posterPath || null,
  };
}

/** Puntuación (1–10) → fila de user_ratings (o null si no vale). */
export function mapLetterboxdRatingItem(item, userId, now = new Date()) {
  const tmdbId = movieId(item);
  const rating = Number(item?.rating);
  if (!tmdbId || !Number.isFinite(rating) || rating < 1 || rating > 10) return null;
  return {
    userId,
    tmdbId,
    mediaType: 'movie',
    season: null,
    episode: null,
    rating,
    title: item?.title || null,
    posterPath: item?.posterPath || null,
    ratedAt: validDate(item?.ratedAt, now),
    updatedAt: now,
  };
}

/**
 * Qué visionados entran. Los del diario (con fecha real) entran salvo que ya
 * exista ese mismo visionado (película + instante). Los "sin fecha" (vistas
 * de watched.csv que no están en el diario) solo si la película no tiene
 * ningún visionado: no hay que duplicar lo que ya está marcado como visto.
 *
 * @param items     visionados de la tanda ({ ..., undated }).
 * @param existing  filas de watch_history del usuario.
 * @param keyOf     clave de visionado (historyKey de routes/import).
 */
export function selectLetterboxdHistory(items, existing, userId, keyOf) {
  const existingKeys = new Set(existing.map(keyOf));
  const watchedMovies = new Set(
    existing.filter((row) => row.mediaType === 'movie').map((row) => Number(row.tmdbId)),
  );
  const values = [];
  for (const item of Array.isArray(items) ? items : []) {
    const value = mapLetterboxdHistoryItem(item, userId);
    if (!value) continue;
    if (item?.undated && watchedMovies.has(value.tmdbId)) continue;
    const key = keyOf(value);
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    watchedMovies.add(value.tmdbId);
    values.push(value);
  }
  return values;
}
