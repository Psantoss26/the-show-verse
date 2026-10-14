// Forma de la exportación de datos del usuario (favoritos, pendientes y
// puntuaciones). Sin dependencias de BBDD para poder probarla sola: la lectura
// vive en userExport.js.

export const USER_EXPORT_VERSION = 1;
export const USER_EXPORT_SECTIONS = ['favorites', 'watchlist', 'ratings'];

/** Secciones pedidas en ?include=favorites,ratings (todas si no hay ninguna válida). */
export function parseExportSections(value) {
  const asked = String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => USER_EXPORT_SECTIONS.includes(part));
  return asked.length ? [...new Set(asked)] : [...USER_EXPORT_SECTIONS];
}

/** Las temporadas y los episodios se describen con los datos de su serie. */
export function exportTitleType(mediaType) {
  return mediaType === 'movie' ? 'movie' : 'tv';
}

function isoDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function describeTitle(row, metadataByKey) {
  const type = exportTitleType(row.mediaType);
  // Mismas claves que getMediaMetadataMap: "movie:603", "tv:1396".
  const metadata = metadataByKey.get(`${type}:${row.tmdbId}`) || null;
  const title =
    row.title ||
    (type === 'movie'
      ? metadata?.title || metadata?.original_title
      : metadata?.name || metadata?.original_name) ||
    null;
  const originalTitle =
    (type === 'movie' ? metadata?.original_title : metadata?.original_name) || null;
  const date = type === 'movie' ? metadata?.release_date : metadata?.first_air_date;
  const year = /^\d{4}/.test(String(date || '')) ? Number(String(date).slice(0, 4)) : null;
  // Solo las fichas de película de TMDb traen el id de IMDb sin pedirlo aparte.
  const imdbId = /^tt\d+$/.test(String(metadata?.imdb_id || ''))
    ? metadata.imdb_id
    : null;

  return {
    tmdbId: row.tmdbId,
    mediaType: row.mediaType,
    title,
    originalTitle: originalTitle && originalTitle !== title ? originalTitle : null,
    year,
    imdbId,
  };
}

export function shapeUserExport({
  user = null,
  favorites = null,
  watchlist = null,
  ratings = null,
  metadataByKey = new Map(),
  now = new Date(),
} = {}) {
  const result = {
    app: 'The Show Verse',
    version: USER_EXPORT_VERSION,
    exportedAt: isoDate(now),
    user: user ? { username: user.username || null } : null,
  };

  if (favorites) {
    result.favorites = favorites.map((row) => ({
      ...describeTitle(row, metadataByKey),
      addedAt: isoDate(row.addedAt),
    }));
  }

  if (watchlist) {
    result.watchlist = watchlist.map((row) => ({
      ...describeTitle(row, metadataByKey),
      priority: Number.isFinite(row.priority) ? row.priority : 0,
      addedAt: isoDate(row.addedAt),
    }));
  }

  if (ratings) {
    result.ratings = ratings.map((row) => ({
      ...describeTitle(row, metadataByKey),
      // No usar `||`: la temporada 0 son los especiales.
      season: row.season ?? null,
      episode: row.episode ?? null,
      rating: Number(row.rating),
      ratedAt: isoDate(row.ratedAt),
    }));
  }

  return result;
}
