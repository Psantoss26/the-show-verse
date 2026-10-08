// Las tres elecciones de arte de un título que necesitan las listas, a partir
// de su respuesta de /images de TMDb. Pura: la usan el servidor
// (/api/tmdb/artwork) y los tests. Los criterios son los de siempre:
//   - poster:        el de las tarjetas (Favoritos, fichas de lista):
//                    pickBestFavoriteEnglishPoster; null si no hay inglés.
//   - previewPoster: el de las vistas previas del índice de /lists:
//                    pickBestEnglishPoster.
//   - previewBackdrop: backdrop inglés de ≥780 px o, si no, el neutro mejor
//                    votado (ver lib/lists/previewArtwork).

import {
  pickBestBackdropForPreview,
  pickBestEnglishPoster,
  pickBestFavoriteEnglishPoster,
  pickBestNeutralBackdropByResVotes,
} from "../details/tmdbImages.js";

export function pickListArtwork(images) {
  if (!images) return null;
  const posters = images.posters || [];
  const backdrops = images.backdrops || [];
  return {
    poster: pickBestFavoriteEnglishPoster(posters)?.file_path || null,
    previewPoster: pickBestEnglishPoster(posters)?.file_path || null,
    previewBackdrop:
      pickBestBackdropForPreview(backdrops, { preferLangs: ["en", "en-US"], minWidth: 780 }) ||
      pickBestNeutralBackdropByResVotes(backdrops, { minWidth: 780 })?.file_path ||
      null,
  };
}

/** Normaliza la clave de un título: "movie:603" | "tv:1399" (o null). */
export function artworkItemKey(mediaType, id) {
  const numeric = Number(id);
  if (!Number.isInteger(numeric) || numeric <= 0) return null;
  return `${mediaType === "tv" ? "tv" : "movie"}:${numeric}`;
}
