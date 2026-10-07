// Personalización por usuario de una colección de TMDb.
//
// - Nombre y descripción viven en `uiSettings[collectionCustomization:<id>]`.
// - Póster, fondo de escritorio (`backdrop`) y fondo móvil (`mobilePoster`,
//   un póster) usan el MISMO mecanismo que las portadas y fondos de
//   DetailsClient: `uiSettings.artworkOverrides["collection:<id>"]`, guardado
//   con `saveArtworkOverrides` (cola PATCH con reintentos y fila bloqueada en
//   el backend) y reflejado al instante con `cacheArtworkOverrides`.
const TEXT_FIELDS = ['name', 'description'];
const TMDB_PATH = /^\/[\w.-]+$/;

export const COLLECTION_ARTWORK_TYPE = 'collection';
export const collectionCustomizationKey = (id) => `collectionCustomization:${id}`;
export const collectionArtworkKey = (id) => `${COLLECTION_ARTWORK_TYPE}:${Number(id)}`;

export function readCollectionArtworkOverride(preferences, id) {
  const entry = preferences?.uiSettings?.artworkOverrides?.[collectionArtworkKey(id)];
  return entry && typeof entry === 'object' ? entry : {};
}

export function applyCollectionCustomization(collection, customization, artwork = null) {
  if (!collection) return collection;
  const result = { ...collection };
  for (const field of TEXT_FIELDS) {
    const value = customization?.[field];
    if (typeof value !== 'string') continue;
    if (field === 'name' && !value.trim()) continue;
    result[field] = value;
  }
  if (typeof artwork?.poster === 'string' && TMDB_PATH.test(artwork.poster)) result.poster_path = artwork.poster;
  if (typeof artwork?.backdrop === 'string' && TMDB_PATH.test(artwork.backdrop)) result.backdrop_path = artwork.backdrop;
  if (typeof artwork?.mobilePoster === 'string' && TMDB_PATH.test(artwork.mobilePoster)) result.mobile_background_path = artwork.mobilePoster;
  return result;
}

export function buildCollectionCustomization(original, draft) {
  const changes = {};
  for (const field of TEXT_FIELDS) {
    const value = String(draft[field] || '').trim();
    if (field === 'name' && !value) throw new Error('Escribe un nombre para la colección.');
    if (value.length > (field === 'description' ? 5000 : 200)) throw new Error('El texto es demasiado largo.');
    if (value !== String(original[field] || '').trim()) changes[field] = value;
  }
  return Object.keys(changes).length ? changes : null;
}

// Cambios de artwork respecto a lo que ya hay guardado. Elegir la imagen
// original de TMDb borra el override (filePath null), igual que el
// restablecimiento de la ficha.
export function buildCollectionArtworkChanges(original, current, draft) {
  const changes = [];
  for (const [kind, field] of [['poster', 'poster_path'], ['backdrop', 'backdrop_path'], ['mobilePoster', 'mobile_background_path']]) {
    const value = draft[field] || null;
    if (value && !TMDB_PATH.test(value)) throw new Error('Selecciona una imagen válida de TMDb.');
    if (value === (current[field] || null)) continue;
    changes.push({ kind, filePath: value && value !== original[field] ? value : null });
  }
  return changes;
}
