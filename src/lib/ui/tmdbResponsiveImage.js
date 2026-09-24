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
 * Tamaño de TMDb que el navegador elegirá para pintar a `cssWidth` en una
 * pantalla de densidad `dpr`: el más pequeño que lo cubre (o el mayor que hay).
 */
export function tmdbPosterWidthFor(cssWidth, dpr = 1) {
  const needed = Math.max(0, Number(cssWidth) || 0) * (Number(dpr) || 1);
  return (
    TMDB_POSTER_WIDTHS.find((w) => w >= needed) ??
    TMDB_POSTER_WIDTHS[TMDB_POSTER_WIDTHS.length - 1]
  );
}

/** URL de TMDb con el tamaño `w<width>`, o `null` si no es de TMDb. */
export function tmdbPosterUrlAt(url, width) {
  const match = TMDB_IMAGE_RE.exec(String(url || ""));
  if (!match) return null;
  const [, base, , path] = match;
  return `${base}w${width}${path}`;
}

// ¿Hay que reescribir `sizes`? Solo si la imagen necesita un tamaño de TMDb
// MAYOR que el que ya tiene.
//
// Cambiar `sizes` hace que el navegador vuelva a elegir entre el `srcset`, y en
// Chrome eso descarta la imagen pintada: la tarjeta se queda en blanco y la
// vuelve a pedir aunque la URL elegida sea la misma. Pasaba en cada tarjeta al
// reorganizarse la rejilla (abrir el panel lateral acoplado, redimensionar la
// ventana): las tarjetas "se recargaban". Encoger no lo necesita —la imagen ya
// pintada cubre de sobra el nuevo tamaño—, y dentro del mismo tamaño de TMDb
// tampoco.
export function shouldGrowTmdbSizes(currentCssWidth, nextCssWidth, dpr = 1) {
  if (!(currentCssWidth > 0)) return true;
  return (
    tmdbPosterWidthFor(nextCssWidth, dpr) >
    tmdbPosterWidthFor(currentCssWidth, dpr)
  );
}

/**
 * Aplica `srcset` y `sizes` a un <img> de TMDb para que se pinte a `cssWidth`.
 * Devuelve `false` si la imagen no es de TMDb (se deja tal cual).
 *
 * La primera vez (o si cambia la imagen) se escriben ya. Después solo se
 * reescribe `sizes` para CRECER a un tamaño de TMDb mayor, y ese tamaño se
 * precarga antes: al cambiar `sizes` ya está en caché y el póster pasa de uno a
 * otro sin quedarse en blanco.
 */
export function applyTmdbResponsiveImage(img, cssWidth) {
  if (!img || !(cssWidth > 0)) return false;
  const src = img.getAttribute("src");
  const srcset = tmdbPosterSrcSet(src);
  if (!srcset) return false;
  const nextWidth = Math.ceil(cssWidth);
  const sizes = `${nextWidth}px`;

  if (img.getAttribute("srcset") !== srcset) {
    // `sizes` antes que `srcset`: así la primera elección ya usa el ancho bueno.
    img.setAttribute("sizes", sizes);
    img.setAttribute("srcset", srcset);
    return true;
  }

  const currentWidth = Number.parseFloat(img.getAttribute("sizes")) || 0;
  const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
  if (!shouldGrowTmdbSizes(currentWidth, nextWidth, dpr)) return true;

  // Todavía cargando: no hay nada pintado que perder.
  if (!img.complete || typeof Image === "undefined") {
    img.setAttribute("sizes", sizes);
    return true;
  }

  const pending = tmdbPosterUrlAt(src, tmdbPosterWidthFor(nextWidth, dpr));
  if (img.dataset.svPendingSrc === pending) return true;
  img.dataset.svPendingSrc = pending;
  const preload = new Image();
  preload.src = pending;
  const swap = () => {
    if (img.dataset.svPendingSrc !== pending) return;
    delete img.dataset.svPendingSrc;
    // Si mientras tanto cambió la imagen, su propio `update` ya la ajustó.
    if (img.getAttribute("srcset") !== srcset) return;
    const latest = Number.parseFloat(img.getAttribute("sizes")) || 0;
    if (shouldGrowTmdbSizes(latest, nextWidth, dpr)) {
      img.setAttribute("sizes", sizes);
    }
  };
  (preload.decode ? preload.decode() : Promise.resolve()).then(swap, swap);
  return true;
}
