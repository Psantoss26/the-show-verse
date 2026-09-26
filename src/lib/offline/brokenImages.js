// Sin conexión muchas portadas, avatares o iconos no están en la caché de
// imágenes. El navegador pinta entonces su icono de imagen rota junto al texto
// alternativo; en su lugar se oculta la imagen. `error` no burbujea, así que se
// escucha en fase de captura. Si el componente cambia el `src` (fallbacks) la
// marca se retira para que el nuevo recurso pueda cargar y mostrarse.
const BROKEN = "data-img-broken";

const isBroken = (img) => img.complete && img.naturalWidth === 0 && Boolean(img.currentSrc || img.getAttribute("src"));

export function hideBrokenImages(root = document) {
  const markIfBroken = (img) => { if (isBroken(img)) img.setAttribute(BROKEN, ""); };
  const error = (event) => {
    if (event.target instanceof HTMLImageElement) event.target.setAttribute(BROKEN, "");
  };
  const load = (event) => {
    if (event.target instanceof HTMLImageElement) event.target.removeAttribute(BROKEN);
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") {
        if (record.target instanceof HTMLImageElement) record.target.removeAttribute(BROKEN);
        continue;
      }
      for (const node of record.addedNodes) {
        if (node instanceof HTMLImageElement) markIfBroken(node);
        else if (node instanceof Element) node.querySelectorAll("img").forEach(markIfBroken);
      }
    }
  });

  // Imágenes del HTML inicial que fallaron antes de hidratar.
  root.querySelectorAll("img").forEach(markIfBroken);
  root.addEventListener("error", error, true);
  root.addEventListener("load", load, true);
  observer.observe(root.body || root, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "srcset"] });

  return () => {
    root.removeEventListener("error", error, true);
    root.removeEventListener("load", load, true);
    observer.disconnect();
  };
}
