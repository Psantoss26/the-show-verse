// Personalización por usuario de una colección de TMDb: SOLO sus imágenes.
// El nombre y la descripción son siempre los de TMDb (antes se podían editar y
// se guardaban en `uiSettings[collectionCustomization:<id>]`; esas entradas ya
// no se aplican).
//
// Las imágenes usan el MISMO mecanismo que las portadas y fondos de
// DetailsClient: `uiSettings.artworkOverrides["collection:<id>"]`, guardado
// con `saveArtworkOverrides` (cola PATCH con reintentos y fila bloqueada en
// el backend) y reflejado al instante con `cacheArtworkOverrides`.
//
// Tipos de imagen (el backend solo admite poster, mobilePoster, backdrop,
// background y logo) y a qué campo de la colección se aplican:
//   - poster       → poster_path              (póster, con título)
//   - backdrop     → backdrop_path            (fondo de la página en ordenador)
//   - mobilePoster → mobile_background_path   (fondo de la página en móvil)
//   - background   → cover_backdrop_path      (imagen de la PORTADA en modo
//     backdrop, con título). OJO: en una ficha de título `background` es el
//     fondo de la página; en las colecciones ese papel ya lo tenía `backdrop`
//     y `background` era el único tipo libre.
const TMDB_PATH = /^\/[\w.-]+$/;

const ARTWORK_FIELDS = [
  ['poster', 'poster_path'],
  ['backdrop', 'backdrop_path'],
  ['mobilePoster', 'mobile_background_path'],
  ['background', 'cover_backdrop_path'],
];

export const COLLECTION_ARTWORK_TYPE = 'collection';
export const collectionArtworkKey = (id) => `${COLLECTION_ARTWORK_TYPE}:${Number(id)}`;

export function readCollectionArtworkOverride(preferences, id) {
  const entry = preferences?.uiSettings?.artworkOverrides?.[collectionArtworkKey(id)];
  return entry && typeof entry === 'object' ? entry : {};
}

/** La colección con las imágenes que haya elegido el usuario (las válidas). */
export function applyCollectionCustomization(collection, artwork = null) {
  if (!collection) return collection;
  const result = { ...collection };
  for (const [kind, field] of ARTWORK_FIELDS) {
    const value = artwork?.[kind];
    if (typeof value === 'string' && TMDB_PATH.test(value)) result[field] = value;
  }
  return result;
}

// Cambios de artwork respecto a lo que ya hay guardado. Elegir la imagen
// original (la automática) borra el override (filePath null), igual que el
// restablecimiento de la ficha.
export function buildCollectionArtworkChanges(original, current, draft) {
  const changes = [];
  for (const [kind, field] of ARTWORK_FIELDS) {
    const value = draft[field] || null;
    if (value && !TMDB_PATH.test(value)) throw new Error('Selecciona una imagen válida de TMDb.');
    if (value === (current[field] || null)) continue;
    changes.push({ kind, filePath: value && value !== original[field] ? value : null });
  }
  return changes;
}
