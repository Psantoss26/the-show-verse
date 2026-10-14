// IMÁGENES DE LAS ÚLTIMAS PÁGINAS, VIVAS EN LA CACHÉ DE MEMORIA.
//
// Al volver atrás (p. ej. de una ficha a Favoritos en móvil) la página se
// remonta entera y sus <img> son elementos nuevos. Chrome solo las pinta en el
// mismo fotograma si la imagen sigue en su caché de MEMORIA, y solo garantiza
// que siga ahí mientras algún elemento vivo la referencia. Al desmontar la
// página nadie la referencia y la ficha (con decenas de imágenes grandes) la
// desaloja: medido con Playwright en móvil, al volver 9 de 10 portadas
// visibles se volvían a pedir a la caché de disco (35-85 ms + decodificar) y
// se veía el placeholder y el fundido de cada tarjeta a destiempo. Más
// frecuente en un teléfono real, que tiene menos memoria para esa caché.
//
// Se guarda un `new Image()` por cada imagen cargada, agrupado por página: no
// pinta nada, pero mantiene la imagen en la caché de memoria. Con él, al
// volver todas salían pintadas en el primer fotograma (3 de 3 frente a 0 de 3).
const MAX_PAGES = 4;
const MAX_PER_PAGE = 150;
// Las enormes (fondos `original` de las fichas) ocupan mucho y no son las que
// parpadean al volver a una página de usuario.
const MAX_PIXELS = 2_500_000;

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
    retain(pageKey, { src, crossOrigin = null, width = 0, height = 0 }) {
      if (!/^https?:/.test(src || "")) return;
      if (width * height > maxPixels) return;
      const page = pages.get(pageKey) || new Map();
      pages.delete(pageKey);
      pages.set(pageKey, page);
      if (!page.has(src)) {
        const image = createImage();
        // Sin el mismo modo CORS la caché de memoria no la reutiliza.
        if (crossOrigin) image.crossOrigin = crossOrigin;
        image.src = src;
        page.set(src, image);
        if (page.size > maxPerPage) page.delete(page.keys().next().value);
      }
      while (pages.size > maxPages) pages.delete(pages.keys().next().value);
    },
    has(src) {
      for (const page of pages.values()) if (page.has(src)) return true;
      return false;
    },
  };
}

let installed = false;

export function installPageImageRetention() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  const retainer = createImageRetainer({ createImage: () => new Image() });
  const retain = (image) => {
    if (!image.complete || !image.naturalWidth) return;
    retainer.retain(window.location.pathname, {
      src: image.currentSrc || image.src,
      crossOrigin: image.crossOrigin,
      width: image.naturalWidth,
      height: image.naturalHeight,
    });
  };
  // `load` no burbujea, pero sí se captura en el documento.
  document.addEventListener(
    "load",
    (event) => {
      if (event.target instanceof HTMLImageElement) retain(event.target);
    },
    true,
  );
  // Las que cargaron antes de que hidratara la app.
  for (const image of document.images) retain(image);
}
