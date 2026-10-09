// Portada elegida por el usuario para una TEMPORADA («Editar portada»).
//
// Mismo mecanismo que las colecciones (lib/lists/collectionCustomization) y
// las portadas de DetailsClient: `uiSettings.artworkOverrides["season:<id>"]`,
// guardado con `saveArtworkOverrides` y reflejado al instante con
// `cacheArtworkOverrides`. El id es el de la temporada en TMDb (`season.id`),
// único entre todas las series, así que no choca con el de ninguna serie.
// Solo se elige el póster (`poster`).
const TMDB_PATH = /^\/[\w.-]+$/;

export const SEASON_ARTWORK_TYPE = 'season';
export const seasonArtworkKey = (id) => `${SEASON_ARTWORK_TYPE}:${Number(id)}`;

/** El póster elegido para la temporada, o `null` si no hay (o no es válido). */
export function readSeasonCustomPoster(preferences, seasonId) {
  if (seasonId == null) return null;
  const entry = preferences?.uiSettings?.artworkOverrides?.[seasonArtworkKey(seasonId)];
  const poster = entry && typeof entry === 'object' ? entry.poster : null;
  return typeof poster === 'string' && TMDB_PATH.test(poster) ? poster : null;
}

// Cambio respecto a lo guardado. Elegir el póster automático (el original)
// borra la elección (filePath null), como «Restaurar TMDb» en las colecciones.
export function buildSeasonCoverChanges(originalPoster, currentPoster, draftPoster) {
  const value = draftPoster || null;
  if (value && !TMDB_PATH.test(value)) throw new Error('Selecciona una imagen válida de TMDb.');
  if (value === (currentPoster || null)) return [];
  return [{ kind: 'poster', filePath: value && value !== originalPoster ? value : null }];
}
