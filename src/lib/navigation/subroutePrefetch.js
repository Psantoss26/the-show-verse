// PRECARGA DEL PANEL DE TEMPORADA/EPISODIO al apuntar a su enlace.
//
// El panel pinta la ficha real en un iframe (`/embed/details/...`): cada vez
// que se abre, el navegador pide ese documento y arranca la página entera. La
// ficha de títulos (DetailModal) no tiene ese coste, por eso aparecía antes.
// Con `<link rel="prefetch">` el documento ya está descargado cuando llega el
// clic: Chrome guarda lo precargado 5 minutos aunque la respuesta pida
// revalidar (`max-age=0, must-revalidate`, no `no-store`), y la navegación del
// iframe lo toma de ahí. Medido: un episodio pasa de ~370 ms a ~140 ms hasta
// tener portada.
//
// Solo con intención real (el puntero se para en el enlace o recibe el foco):
// en una rejilla de episodios no se precarga todo lo que se cruza.

import { buildEmbeddedDetailsHref } from "@/lib/navigation/embeddedDetails";
import { detailPreviewFromHref, panelDetailsHref } from "@/lib/navigation/detailPreview";

const INTENT_DELAY_MS = 80;
// Tope por documento: cada precarga es una página renderizada en el servidor.
const MAX_PREFETCHES = 40;

const prefetched = new Set();

// `target`: el item (`{ media_type: "season" | "episode", showId, ... }`) o un
// href de ficha. Devuelve si se ha lanzado (o ya estaba) la precarga.
export function prefetchSubrouteDetails(target) {
  if (typeof document === "undefined" || !target) return false;
  const item =
    typeof target === "string"
      ? detailPreviewFromHref(target, window.location.origin)
      : target;
  const href = panelDetailsHref(item);
  if (!href) return false;
  const embedHref = buildEmbeddedDetailsHref(href);
  if (prefetched.has(embedHref)) return true;
  if (prefetched.size >= MAX_PREFETCHES) return false;
  prefetched.add(embedHref);
  const link = document.createElement("link");
  link.rel = "prefetch";
  link.as = "document";
  link.href = embedHref;
  document.head.append(link);
  return true;
}

// Delegación para un contenedor con enlaces a temporadas/episodios: precarga
// el que se apunta si el puntero se queda `INTENT_DELAY_MS` en él. Devuelve los
// manejadores de `pointerover`/`pointerout`/`focusin` y la limpieza.
export function createSubrouteLinkIntent({ enabled = () => true } = {}) {
  let timer = 0;
  let pending = null;
  const linkFor = (event) => {
    const link = event.target?.closest?.("a[href]");
    if (!link || !enabled()) return null;
    const item = detailPreviewFromHref(link.href, window.location.origin);
    return item && (item.media_type === "season" || item.media_type === "episode") ? { link, item } : null;
  };
  const cancel = () => {
    window.clearTimeout(timer);
    timer = 0;
    pending = null;
  };
  return {
    onPointerOver(event) {
      const hit = linkFor(event);
      if (!hit || hit.link === pending) return;
      cancel();
      pending = hit.link;
      timer = window.setTimeout(() => {
        pending = null;
        prefetchSubrouteDetails(hit.item);
      }, INTENT_DELAY_MS);
    },
    onPointerOut(event) {
      if (pending && !pending.contains(event.relatedTarget)) cancel();
    },
    onFocusIn(event) {
      const hit = linkFor(event);
      if (hit) prefetchSubrouteDetails(hit.item);
    },
    dispose: cancel,
  };
}
