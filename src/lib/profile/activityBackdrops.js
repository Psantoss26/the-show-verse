// Imagen de cada acción de la Actividad (Perfil y Social) en la vista «Lista
// con backdrop», la misma que su página de detalles (ver ActivityBackdropImage):
//   - título: su backdrop, pedido en LOTE a /api/tmdb/artwork
//     (`previewBackdrop`: escalera de idioma, ≥780 px), cacheado un día;
//   - colección: el backdrop con idioma de su galería (o el elegido al
//     editarla);
//   - lista: la estantería de pósters de sus primeros títulos (`previewItems`,
//     que añade la API).

const TV_TYPES = new Set(["tv", "show", "season", "episode"]);
// Sin ficha de título propia: el arte es el de la lista o la colección.
const WITHOUT_TITLE = new Set(["list", "like_list", "like_collection"]);

/** Título de TMDb cuyo backdrop corresponde a la acción, o null. */
export function activityBackdropTarget(item) {
  if (!item || WITHOUT_TITLE.has(item.type)) return null;
  const tmdbId = Number(item.tmdbId);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !item.mediaType) return null;
  return { mediaType: TV_TYPES.has(item.mediaType) ? "tv" : "movie", tmdbId };
}

export function activityBackdropSrc(path, size = "w780") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

/**
 * ¿Tiene imagen la acción en la vista «Lista con backdrop»? Su póster, el
 * backdrop de su título, la estantería de su lista (`previewItems`) o el
 * backdrop de su colección.
 */
export function hasActivityBackdropArtwork(item) {
  if (typeof item?.posterPath === "string" && item.posterPath.trim()) return true;
  if (activityBackdropTarget(item)) return true;
  if ((item?.type === "list" || item?.type === "like_list") && item.previewItems?.length) return true;
  return item?.type === "like_collection" && Number(item.collectionId) > 0;
}
