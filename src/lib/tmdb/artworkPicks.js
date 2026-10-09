// Las tres elecciones de arte de un título que necesitan las listas, a partir
// de su respuesta de /images de TMDb. Pura: la usan el servidor
// (/api/tmdb/artwork) y los tests. Los criterios son los de siempre:
//   - poster:        el de las tarjetas (Favoritos, fichas de lista):
//                    pickBestFavoriteEnglishPoster; null si no hay inglés.
//   - previewPoster: el de las vistas previas del índice de /lists:
//                    pickBestEnglishPoster.
//   - previewBackdrop: backdrop inglés de ≥780 px o, si no, el neutro mejor
//                    votado (ver lib/lists/previewArtwork).
//   - coverPoster:   el de los MOSAICOS de portada de las listas: SIN texto.
//                    El mosaico recorta cada póster a su celda y con el
//                    título impreso lo cortaba. Póster sin idioma y, si el
//                    título no tiene ninguno, su backdrop sin idioma (de
//                    celda vertical se recorta sin problema); solo si tampoco
//                    hay, el póster inglés.

import {
  pickBestBackdropForPreview,
  pickBestEnglishPoster,
  pickBestFavoriteEnglishPoster,
  pickBestNeutralBackdropByResVotes,
  pickBestNeutralPosterByResVotes,
} from "../details/tmdbImages.js";

// Sin idioma en TMDb: `iso_639_1` nulo, vacío o "xx". Se normaliza a null
// porque los selectores neutros solo reconocen ese valor, y se filtra ANTES:
// sin candidatos neutros, `pickBestNeutralPosterByResVotes` cae a cualquiera.
function textlessImages(list) {
  return (Array.isArray(list) ? list : [])
    .filter((image) => {
      const lang = String(image?.iso_639_1 || "").toLowerCase();
      return image?.file_path && (!lang || lang === "xx");
    })
    .map((image) => ({ ...image, iso_639_1: null }));
}

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
    coverPoster:
      pickBestNeutralPosterByResVotes(textlessImages(posters))?.file_path ||
      pickBestNeutralPosterByResVotes(textlessImages(backdrops))?.file_path ||
      pickBestFavoriteEnglishPoster(posters)?.file_path ||
      null,
  };
}

/** Normaliza la clave de un título: "movie:603" | "tv:1399" (o null). */
export function artworkItemKey(mediaType, id) {
  const numeric = Number(id);
  if (!Number.isInteger(numeric) || numeric <= 0) return null;
  return `${mediaType === "tv" ? "tv" : "movie"}:${numeric}`;
}
