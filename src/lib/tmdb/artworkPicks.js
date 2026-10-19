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
//   - textlessPoster: SOLO un póster sin idioma, o null (sin recurrir a
//                    backdrops ni a pósters con texto). El fondo de mosaico
//                    de la ficha de una persona (ActorCollageBackground).
//   - dashboardBackdrop / dashboardBackdropAlt: el backdrop de las tarjetas y
//                    vistas previas de los dashboards (≥1200 px, misma
//                    escalera, resolución preferida) y el SIGUIENTE (segunda
//                    imagen de «Mejor valoradas»). Con ellos los dashboards
//                    eligen el arte de cada tarjeta en lote, sin pedir /images
//                    desde el navegador por cada una.

import {
  pickBestNeutralPosterByResVotes,
  pickLadderBackdrop,
  pickLadderPoster,
} from "../details/tmdbImages.js";
import {
  imageLanguageTiers,
  pickPreferredResolutionBackdrop,
} from "./imageLanguageLadder.js";

// Resoluciones preferidas de los backdrops del dashboard, en orden.
const DASHBOARD_BACKDROP_SIZES = [
  [1920, 1080],
  [1712, 964],
  [3840, 2160],
];

// Escalera de idioma de toda la app (inglés → español → idioma original → sin
// idioma). Dentro de cada idioma, de los tres primeros de TMDb con el ancho
// mínimo, el de resolución preferida; `offset` pide el siguiente (segunda imagen
// del hero). `includeNoLanguage: false` descarta el escalón sin idioma.
export function pickBestBackdropByLangResVotes(list, opts = {}) {
  const {
    minWidth = 1200,
    offset = 0,
    includeNoLanguage = true,
    originalLanguage,
  } = opts;
  const tiers = imageLanguageTiers(list, { originalLanguage });
  if (!includeNoLanguage) tiers.pop();
  for (const tier of tiers) {
    const picked = pickPreferredResolutionBackdrop(tier, {
      minWidth,
      offset,
      sizes: DASHBOARD_BACKDROP_SIZES,
    });
    if (picked) return picked;
  }
  return null;
}

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

/** Póster SIN idioma de un título (o null), sin recurrir a otro arte. */
export function pickTextlessPoster(posters) {
  return pickBestNeutralPosterByResVotes(textlessImages(posters))?.file_path || null;
}

export function pickListArtwork(images, { originalLanguage } = {}) {
  if (!images) return null;
  const posters = images.posters || [];
  const backdrops = images.backdrops || [];
  const poster = pickLadderPoster(posters, { originalLanguage })?.file_path || null;
  const textlessPoster = pickTextlessPoster(posters);
  return {
    poster,
    previewPoster: poster,
    previewBackdrop: pickLadderBackdrop(backdrops, { originalLanguage, minWidth: 780 })?.file_path || null,
    textlessPoster,
    coverPoster:
      textlessPoster ||
      pickBestNeutralPosterByResVotes(textlessImages(backdrops))?.file_path ||
      poster,
    dashboardBackdrop:
      pickBestBackdropByLangResVotes(backdrops, { originalLanguage })?.file_path || null,
    dashboardBackdropAlt:
      pickBestBackdropByLangResVotes(backdrops, { originalLanguage, offset: 1 })?.file_path || null,
  };
}

// Póster de una TEMPORADA (tarjetas de «Temporadas» de la ficha), con la misma
// escalera que el de los títulos. Su galería de TMDb solo trae pósters.
export function pickSeasonArtwork(images, { originalLanguage } = {}) {
  if (!images) return null;
  return { poster: pickLadderPoster(images.posters || [], { originalLanguage })?.file_path || null };
}

/** Normaliza la clave de un título: "movie:603" | "tv:1399" (o null). */
export function artworkItemKey(mediaType, id) {
  const numeric = Number(id);
  if (!Number.isInteger(numeric) || numeric <= 0) return null;
  return `${mediaType === "tv" ? "tv" : "movie"}:${numeric}`;
}

/** Clave de una temporada: "season:1396:2" (0 = especiales; o null). */
export function seasonArtworkKey(showId, seasonNumber) {
  const show = Number(showId);
  const season = Number(seasonNumber);
  if (!Number.isInteger(show) || show <= 0) return null;
  if (!Number.isInteger(season) || season < 0) return null;
  return `season:${show}:${season}`;
}

/** Normaliza cualquier clave del lote (título o temporada), o null. */
export function normalizeArtworkKey(raw) {
  const [kind, id, season] = String(raw).split(":");
  return kind === "season" ? seasonArtworkKey(id, season) : artworkItemKey(kind, id);
}
