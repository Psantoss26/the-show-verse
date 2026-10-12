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

/** Favorita (like) o pendiente (watchlist) → fila de favorites / watchlist. */
export function mapLetterboxdCollectionItem(item, userId, now = new Date()) {
  const tmdbId = movieId(item);
  if (!tmdbId) return null;
  return {
    userId,
    tmdbId,
    mediaType: 'movie',
    title: item?.title || null,
    posterPath: item?.posterPath || null,
    addedAt: validDate(item?.addedAt, now),
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
 * Clave de visionado por DÍA: Letterboxd solo guarda la fecha, así que una
 * película ya marcada ese mismo día en The Show Verse (a cualquier hora) es el
 * mismo visionado y no se duplica.
 */
export function letterboxdDayKey(item) {
  const date = new Date(item?.watchedAt);
  if (Number.isNaN(date.getTime())) return '';
  return [Number(item.tmdbId), item.mediaType, item.season ?? '', item.episode ?? '', date.toISOString().slice(0, 10)].join(':');
}

/**
 * Qué visionados entran. Los del diario (con fecha real) entran salvo que ya
 * exista ese mismo visionado (película + instante). Los "sin fecha" (vistas
 * de watched.csv que no están en el diario) solo si la película no tiene
 * ningún visionado: no hay que duplicar lo que ya está marcado como visto.
 * Además, un mismo día cuenta una vez (letterboxdDayKey).
 *
 * @param items     visionados de la tanda ({ ..., undated }).
 * @param existing  filas de watch_history del usuario.
 * @param keyOf     clave de visionado (por defecto, por día).
 */
export function selectLetterboxdHistory(items, existing, userId, keyOf = letterboxdDayKey) {
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
