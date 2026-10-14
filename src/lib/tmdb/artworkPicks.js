// Las elecciones de arte de un título que necesitan las listas, a partir de
// su respuesta de /images de TMDb. Pura: la usan el servidor
// (/api/tmdb/artwork) y los tests.
//   - poster / previewPoster: el de las tarjetas y las vistas previas del
//                    índice de /lists, con la escalera de idioma (inglés →
//                    español → original → sin idioma); null si no hay
//                    ninguno. Iguales: se conservan los dos nombres porque
//                    los leen consumidores distintos.
//   - previewBackdrop: backdrop de ≥780 px con la misma escalera.
//   - coverPoster:   el de los MOSAICOS de portada de las listas: SIN texto.
//                    El mosaico recorta cada póster a su celda y con el
//                    título impreso lo cortaba. Póster sin idioma y, si el
//                    título no tiene ninguno, su backdrop sin idioma (de
//                    celda vertical se recorta sin problema); solo si tampoco
//                    hay, el de la escalera.

import {
  pickBestNeutralPosterByResVotes,
  pickLadderBackdrop,
  pickLadderPoster,
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

export function pickListArtwork(images, { originalLanguage } = {}) {
  if (!images) return null;
  const posters = images.posters || [];
  const backdrops = images.backdrops || [];
  const poster = pickLadderPoster(posters, { originalLanguage })?.file_path || null;
  return {
    poster,
    previewPoster: poster,
    previewBackdrop: pickLadderBackdrop(backdrops, { originalLanguage, minWidth: 780 })?.file_path || null,
    coverPoster:
      pickBestNeutralPosterByResVotes(textlessImages(posters))?.file_path ||
      pickBestNeutralPosterByResVotes(textlessImages(backdrops))?.file_path ||
      poster,
  };
}

/** Normaliza la clave de un título: "movie:603" | "tv:1399" (o null). */
export function artworkItemKey(mediaType, id) {
  const numeric = Number(id);
  if (!Number.isInteger(numeric) || numeric <= 0) return null;
  return `${mediaType === "tv" ? "tv" : "movie"}:${numeric}`;
}
