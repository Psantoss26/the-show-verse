// src/lib/imdbImport.js
// Importación de IMDb: puntuaciones (películas, series y episodios), vistos,
// watchlist y listas de títulos ya resueltos a TMDb (la resolución por id de
// IMDb la hace el front, /api/imdb/import).

const LIST_NAME_MAX = 100;

function validDate(value, fallback = null) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function titleId(item) {
  const tmdbId = Number(item?.tmdbId);
  return Number.isInteger(tmdbId) && tmdbId > 0 ? tmdbId : null;
}

function episodeNumbers(item) {
  const season = Number(item?.season);
  const episode = Number(item?.episode);
  return Number.isInteger(season) && season >= 0 && Number.isInteger(episode) && episode > 0
    ? { season, episode }
    : null;
}

/** Puntuación → fila de user_ratings (o null si no vale). */
export function mapImdbRatingItem(item, userId, now = new Date()) {
  const tmdbId = titleId(item);
  const rating = Number(item?.rating);
  const mediaType = item?.mediaType;
  if (!tmdbId || !Number.isFinite(rating) || rating < 1 || rating > 10) return null;
  if (!['movie', 'tv', 'episode'].includes(mediaType)) return null;
  const numbers = mediaType === 'episode' ? episodeNumbers(item) : null;
  if (mediaType === 'episode' && !numbers) return null;
  return {
    userId,
    tmdbId,
    mediaType,
    season: numbers?.season ?? null,
    episode: numbers?.episode ?? null,
    rating,
    title: item?.title || null,
    posterPath: item?.posterPath || null,
    ratedAt: validDate(item?.ratedAt, now),
    updatedAt: now,
  };
}

/** Visto (película, o episodio con su serie) → fila de watch_history. */
export function mapImdbHistoryItem(item, userId) {
  const tmdbId = titleId(item);
  const watchedAt = validDate(item?.watchedAt);
  if (!tmdbId || !watchedAt) return null;
  if (item?.mediaType === 'movie') {
    return { userId, tmdbId, mediaType: 'movie', season: null, episode: null, watchedAt, title: item?.title || null, posterPath: item?.posterPath || null };
  }
  const numbers = item?.mediaType === 'tv' ? episodeNumbers(item) : null;
  if (!numbers) return null;
  return { userId, tmdbId, mediaType: 'tv', ...numbers, watchedAt, title: item?.title || null, posterPath: item?.posterPath || null };
}

const historyTitleKey = (row) =>
  [Number(row.tmdbId), row.mediaType, row.season ?? '', row.episode ?? ''].join(':');

/**
 * Qué vistos entran. IMDb no guarda visionados, solo la fecha de la
 * valoración: un título puntuado cuenta como visto UNA vez y solo si aún no
 * tiene ningún visionado aquí (película, o ese episodio concreto).
 */
export function selectImdbHistory(items, existing, userId) {
  const seen = new Set((Array.isArray(existing) ? existing : []).map(historyTitleKey));
  const values = [];
  for (const item of Array.isArray(items) ? items : []) {
    const value = mapImdbHistoryItem(item, userId);
    if (!value) continue;
    const key = historyTitleKey(value);
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(value);
  }
  return values;
}

/** Título de la watchlist → fila de watchlist (películas y series). */
export function mapImdbCollectionItem(item, userId, now = new Date()) {
  const tmdbId = titleId(item);
  if (!tmdbId || !['movie', 'tv'].includes(item?.mediaType)) return null;
  return {
    userId,
    tmdbId,
    mediaType: item.mediaType,
    title: item?.title || null,
    posterPath: item?.posterPath || null,
    addedAt: validDate(item?.addedAt, now),
  };
}

/** Nombre de lista válido (recortado) o ''. */
export function imdbListName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, LIST_NAME_MAX);
}

/** Título de una lista → fila de user_list_items. */
export function mapImdbListItem(item, listId, now = new Date()) {
  const tmdbId = titleId(item);
  if (!tmdbId || !['movie', 'tv'].includes(item?.mediaType)) return null;
  const position = Number(item?.position);
  const voteAverage = Number(item?.voteAverage);
  return {
    listId,
    tmdbId,
    mediaType: item.mediaType,
    title: item?.title || null,
    posterPath: item?.posterPath || null,
    voteAverage: Number.isFinite(voteAverage) && voteAverage > 0 ? voteAverage : null,
    position: Number.isInteger(position) && position > 0 ? position : 0,
    addedAt: validDate(item?.addedAt, now),
  };
}
