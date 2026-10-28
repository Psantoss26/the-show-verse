// Personalización por usuario de una colección de TMDb: SOLO sus imágenes.
// El nombre y la descripción son siempre los de TMDb (antes se podían editar y
// se guardaban en `uiSettings[collectionCustomization:<id>]`; esas entradas ya
// no se aplican).
//
// Las imágenes usan el MISMO mecanismo que las portadas y fondos de
// DetailsClient (cada elección es además un voto y la más votada es la imagen
// por defecto para todos): `uiSettings.artworkOverrides["collection:<id>"]`, guardado
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

// Campos con la elección PROPIA guardada (sin ella, `null`), a partir de los
// overrides del usuario.
export function collectionOwnArtwork(artwork = null) {
  return Object.fromEntries(
    ARTWORK_FIELDS.map(([kind, field]) => {
      const value = artwork?.[kind];
      return [field, typeof value === 'string' && TMDB_PATH.test(value) ? value : null];
    }),
  );
}

// Imágenes MÁS VOTADAS de la colección (/api/community/collection/:id/artwork,
// por tipo) como campos de la colección; las que no sean rutas válidas, null.
export const collectionCommunityArtwork = collectionOwnArtwork;

// Cambios respecto a la elección propia guardada. Como en «Portadas y fondos»
// de la ficha, cada elección se guarda tal cual y cuenta como voto (también si
// es la automática); `null` (Restaurar) la borra y retira el voto.
export function buildCollectionArtworkChanges(currentOwn, nextOwn) {
  const changes = [];
  for (const [kind, field] of ARTWORK_FIELDS) {
    const value = nextOwn?.[field] || null;
    if (value && !TMDB_PATH.test(value)) throw new Error('Selecciona una imagen válida de TMDb.');
    if (value === (currentOwn?.[field] || null)) continue;
    changes.push({ kind, filePath: value });
  }
  return changes;
}
