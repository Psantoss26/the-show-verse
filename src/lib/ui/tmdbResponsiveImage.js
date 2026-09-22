// Pósteres de TMDb con el tamaño JUSTO para cómo se pintan.
//
// Pedir siempre un tamaño grande (p. ej. `w780`) para una tarjeta de ~180px
// obliga al navegador a reducir la imagen más de 4 veces en tiempo real, y esa
// reducción suaviza el detalle fino: el texto del póster se veía blando y poco
// legible. Medido en Chrome a 183px de tarjeta, `w342` salía un 34% más nítido
// que `w780` en pantallas normales (1x), y `w500` era el mejor en 2x.
//
// La elección la hace el propio navegador con `srcset` + `sizes`: con el ancho
// al que se va a pintar (`sizes`) y la densidad de la pantalla, descarga el
// tamaño más pequeño de TMDb que lo cubre.

// Tamaños de póster que sirve TMDb (ya reducidos en su servidor, con buena
// calidad). `original` se deja fuera: pesa mucho y no aporta a estos tamaños.
export const TMDB_POSTER_WIDTHS = [185, 342, 500, 780];

const TMDB_IMAGE_RE = /^(https:\/\/image\.tmdb\.org\/t\/p\/)(w\d+|original)(\/.+)$/;

/** `srcset` de una URL de TMDb con todos los tamaños, o `null` si no es de TMDb. */
export function tmdbPosterSrcSet(url) {
  const match = TMDB_IMAGE_RE.exec(String(url || ""));
  if (!match) return null;
  const [, base, , path] = match;
  return TMDB_POSTER_WIDTHS.map((w) => `${base}w${w}${path} ${w}w`).join(", ");
}

/**
 * Aplica `srcset` y `sizes` a un <img> de TMDb para que se pinte a `cssWidth`.
 * Devuelve `false` si la imagen no es de TMDb (se deja tal cual).
 */
export function applyTmdbResponsiveImage(img, cssWidth) {
  if (!img || !(cssWidth > 0)) return false;
  const srcset = tmdbPosterSrcSet(img.getAttribute("src"));
  if (!srcset) return false;
  const sizes = `${Math.ceil(cssWidth)}px`;
  // `sizes` antes que `srcset`: así la primera elección ya usa el ancho bueno.
  if (img.getAttribute("sizes") !== sizes) img.setAttribute("sizes", sizes);
  if (img.getAttribute("srcset") !== srcset) img.setAttribute("srcset", srcset);
  return true;
}
