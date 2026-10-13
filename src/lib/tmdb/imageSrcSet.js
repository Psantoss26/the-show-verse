// `srcSet` de las imágenes de TMDb para que se vean con la calidad del
// original: el navegador elige el tamaño según el ancho en CSS × la densidad de
// píxeles de la pantalla, en vez de estirar un w342 fijo.
//
// No se ofrecen w185/w342: TMDb los reescala con mucho suavizado y compresión,
// y mostrados casi a 1:1 se ven borrosos. Los `sizes` de abajo piden además
// ~1,5× el ancho real (más el zoom del hover) para que el navegador siempre
// REDUZCA una imagen mayor, que es lo que da la nitidez del original.
//
// `original` va al final con un ancho nominal: solo se descarga cuando ningún
// tamaño intermedio basta.

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

const WIDTHS = {
  poster: [
    ["w500", 500],
    ["w780", 780],
    ["original", 2000],
  ],
  backdrop: [
    ["w780", 780],
    ["w1280", 1280],
    ["original", 3840],
  ],
};

export function tmdbSrcSet(path, kind = "poster") {
  if (!path) return undefined;
  return (WIDTHS[kind] || WIDTHS.poster)
    .map(([size, width]) => `${TMDB_IMAGE_BASE}/${size}${path} ${width}w`)
    .join(", ");
}

// Carruseles de pósters de la ficha (3/4/5/6 por fila en los breakpoints de
// DetailsArrowCarousel; ~200px de ancho máximo en escritorio), sobremuestreados.
export const DETAILS_POSTER_ROW_SIZES =
  "(min-width: 1280px) 330px, (min-width: 1024px) 30vw, (min-width: 768px) 38vw, 48vw";

// Pósters de la galería de imágenes (7/6/5/4/3 por fila).
export const DETAILS_GALLERY_POSTER_SIZES =
  "(min-width: 1280px) 18vw, (min-width: 1024px) 24vw, (min-width: 768px) 29vw, (min-width: 640px) 36vw, 48vw";

// Fondos de la galería de imágenes (4/3/2 por fila).
export const DETAILS_GALLERY_BACKDROP_SIZES =
  "(min-width: 768px) 38vw, (min-width: 640px) 48vw, 72vw";
