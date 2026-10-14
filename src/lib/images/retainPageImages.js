// IMÁGENES DE LAS ÚLTIMAS PÁGINAS, VIVAS EN LA CACHÉ DE MEMORIA.
//
// Al volver atrás (p. ej. de una ficha a Favoritos en móvil) la página se
// remonta entera y sus <img> son elementos nuevos. Chrome solo las pinta en el
// mismo fotograma si la imagen sigue en su caché de MEMORIA, y solo garantiza
// que siga ahí mientras algún elemento vivo la referencia. Al desmontar la
// página nadie la referencia y la ficha (con decenas de imágenes grandes) la
// desaloja: medido con Playwright en móvil, al volver 9 de 10 portadas
// visibles se volvían a pedir a la caché de disco (35-85 ms + decodificar) y
// se veía el placeholder y el fundido de cada tarjeta a destiempo.
//
// Se guarda un `new Image()` por cada imagen CERCA DEL VIEWPORT, que son las
// que se ven al volver (la posición de scroll se restaura). No pinta nada,
// pero mantiene la imagen en la caché de memoria. Antes se guardaban las
// últimas 150 CARGADAS: con 200 favoritos, la carga diferida de las de más
// abajo desplazaba a las de pantalla y al volver 14 de 16 salían de disco.
//
// La instantánea se rehace poco después de cada carga o scroll. Entre el
// cambio de página (commit de React) y su `pushState` no corre ningún evento,
// así que `location.pathname` siempre es el de las imágenes del documento.
const MAX_PAGES = 4;
const MAX_PER_PAGE = 80;
// Las enormes (fondos `original` de las fichas) ocupan mucho y no son las que
// parpadean al volver a una página de usuario.
const MAX_PIXELS = 2_500_000;
// Margen alrededor del viewport, en alturas de pantalla.
const VIEWPORT_MARGIN = 0.5;
const SNAPSHOT_DELAY_MS = 150;

export function createImageRetainer({
  createImage,
  maxPages = MAX_PAGES,
  maxPerPage = MAX_PER_PAGE,
  maxPixels = MAX_PIXELS,
}) {
  // Página -> (URL -> imagen retenida). Los Map conservan el orden de
  // inserción: lo primero es lo más antiguo.
  const pages = new Map();

  return {
    // Sustituye lo retenido de la página por estas imágenes.
    replace(pageKey, images) {
      const previous = pages.get(pageKey) || new Map();
      const next = new Map();
      for (const { src, crossOrigin = null, width = 0, height = 0 } of images) {
        if (next.size >= maxPerPage) break;
        if (!/^https?:/.test(src || "") || next.has(src)) continue;
        if (width * height > maxPixels) continue;
        let image = previous.get(src);
        if (!image) {
          image = createImage();
          // Sin el mismo modo CORS la caché de memoria no la reutiliza.
          if (crossOrigin) image.crossOrigin = crossOrigin;
          image.src = src;
        }
        next.set(src, image);
      }
      pages.delete(pageKey);
      pages.set(pageKey, next);
      while (pages.size > maxPages) pages.delete(pages.keys().next().value);
    },
    has(src) {
      for (const page of pages.values()) if (page.has(src)) return true;
      return false;
    },
  };
}

let retainer = null;

// ¿Está retenida (y por tanto en la caché de memoria) esta URL?
export function isImageRetained(src) {
  return Boolean(src && retainer?.has(src));
}

function nearViewportImages() {
  const margin = window.innerHeight * VIEWPORT_MARGIN;
  const images = [];
  for (const image of document.images) {
    if (!image.complete || !image.naturalWidth) continue;
    const rect = image.getBoundingClientRect();
    if (!rect.width || rect.bottom < -margin || rect.top > window.innerHeight + margin) continue;
    images.push({
      src: image.currentSrc || image.src,
      crossOrigin: image.crossOrigin,
      width: image.naturalWidth,
      height: image.naturalHeight,
    });
  }
  return images;
}

export function installPageImageRetention() {
  if (retainer || typeof document === "undefined") return;
  retainer = createImageRetainer({ createImage: () => new Image() });
  let timer = 0;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      retainer.replace(window.location.pathname, nearViewportImages());
    }, SNAPSHOT_DELAY_MS);
  };
  // `load` no burbujea, pero sí se captura en el documento.
  document.addEventListener(
    "load",
    (event) => {
      if (event.target instanceof HTMLImageElement) schedule();
    },
    true,
  );
  window.addEventListener("scroll", schedule, { passive: true });
  schedule();
}
