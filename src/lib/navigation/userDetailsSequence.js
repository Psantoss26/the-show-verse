const STORAGE_KEY = "showverse:user-details-sequence:v1";
const MAX_ITEMS = 240;

function normalizeDetailsHref(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^\/details\/(movie|tv)\/([^/?#]+)\/?(?:[?#].*)?$/);
  if (!match) return null;
  return `/details/${match[1]}/${match[2]}`;
}

// Los enlaces sin caja no se ven: tarjetas de otra variante responsive o de
// un grupo plegado. No forman parte del orden que el usuario tiene delante.
function isRenderedLink(link) {
  return typeof link.getClientRects !== "function" || link.getClientRects().length > 0;
}

// Las pantallas visitadas siguen montadas, ocultas, bajo el contenedor de
// páginas (OverlayRouteHost). Un ámbito que lo abarca —el envoltorio global de
// las páginas del navbar— mezclaba sus enlaces con los de la página activa: un
// título que también estaba en Historial tomaba los vecinos de Historial al
// abrirlo desde Favoritos. El ámbito se limita a la pantalla del enlace.
function narrowToScreen(scope, link) {
  const root = link.closest("[data-scroll-restoration-root]");
  if (!root || !scope.contains(root)) return scope;
  for (const screen of root.children) {
    if (screen.contains(link)) return screen;
  }
  return scope;
}

// Orden completo publicado por la propia página (ver
// useUserDetailsSequenceSource): las que pintan por tandas solo tienen en el
// DOM una parte de sus tarjetas.
const sequenceSources = new WeakMap();

export function setUserDetailsSequenceSource(element, hrefs) {
  if (!(element instanceof Element)) return;
  if (Array.isArray(hrefs)) sequenceSources.set(element, hrefs);
  else sequenceSources.delete(element);
}

function publishedSequenceFor(link, scope) {
  for (
    let node = link.closest("[data-user-details-sequence]");
    node && scope.contains(node);
    node = node.parentElement?.closest("[data-user-details-sequence]")
  ) {
    const hrefs = sequenceSources.get(node);
    if (hrefs) return hrefs;
  }
  return null;
}

function uniqueDetailsHrefs(links) {
  const seen = new Set();
  const hrefs = [];
  for (const link of links) {
    if (!isRenderedLink(link)) continue;
    const href = normalizeDetailsHref(link.getAttribute("href"));
    if (!href || seen.has(href)) continue;
    seen.add(href);
    hrefs.push(href);
    if (hrefs.length === MAX_ITEMS) break;
  }
  return hrefs;
}

/**
 * Guarda la secuencia que el usuario ve en una página de perfil. La secuencia
 * se toma después de filtros, grupos y ordenación, por lo que DetailsClient no
 * necesita reproducir esa lógica ni volver a pedir la lista.
 */
export function saveUserDetailsSequenceFromLink(link, sequenceScope = null) {
  if (typeof window === "undefined" || !(link instanceof HTMLAnchorElement)) {
    return;
  }

  const selectedHref = normalizeDetailsHref(link.getAttribute("href"));
  if (!selectedHref) return;

  // Un enlace fuera del ámbito pedido viene de un portal (el panel lateral de
  // la ficha rápida): sus recomendaciones no son la secuencia de la página.
  if (sequenceScope instanceof Element && !sequenceScope.contains(link)) return;
  if (!link.closest("[data-scroll-restoration-root]")) return;

  const baseScope =
    sequenceScope instanceof Element
      ? sequenceScope
      : link.closest("[data-user-details-sequence]") || link.closest("section");
  if (!baseScope) return;
  const scope = narrowToScreen(baseScope, link);

  const published = publishedSequenceFor(link, scope);
  if (published && saveUserDetailsSequence(published, selectedHref)) return;

  const hrefs = uniqueDetailsHrefs(scope.querySelectorAll('a[href^="/details/"]'));
  if (hrefs.length < 2 || !hrefs.includes(selectedHref)) return;

  storeSequence(hrefs);
}

function storeSequence(hrefs) {
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ hrefs, savedAt: Date.now() }),
    );
  } catch {
    // Si el almacenamiento no está disponible, abrir la ficha sigue funcionando.
  }
}

/**
 * Guarda una secuencia ya ordenada por quien la pinta. Las listas y colecciones
 * montan sus tarjetas por lotes y por grupos, así que el DOM solo tiene una
 * parte: aquí llega el orden completo (tras filtros, orden y agrupación).
 * Devuelve false si la ficha abierta no forma parte de la secuencia.
 */
export function saveUserDetailsSequence(hrefList, selectedHrefValue) {
  if (typeof window === "undefined" || !Array.isArray(hrefList)) return false;

  const selectedHref = normalizeDetailsHref(selectedHrefValue);
  if (!selectedHref) return false;

  const seen = new Set();
  const hrefs = [];
  for (const value of hrefList) {
    const href = normalizeDetailsHref(value);
    if (!href || seen.has(href)) continue;
    seen.add(href);
    hrefs.push(href);
  }

  const index = hrefs.indexOf(selectedHref);
  if (hrefs.length < 2 || index < 0) return false;

  // En listas enormes se guarda una ventana centrada en el título abierto.
  const start = Math.max(
    0,
    Math.min(index - Math.floor(MAX_ITEMS / 2), hrefs.length - MAX_ITEMS),
  );
  storeSequence(hrefs.slice(start, start + MAX_ITEMS));
  return true;
}

export function getUserDetailsSequence(currentHref) {
  if (typeof window === "undefined") return null;
  const current = normalizeDetailsHref(currentHref);
  if (!current) return null;

  try {
    const stored = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "null");
    const hrefs = Array.isArray(stored?.hrefs)
      ? stored.hrefs.map(normalizeDetailsHref).filter(Boolean)
      : [];
    const index = hrefs.indexOf(current);
    if (index < 0 || hrefs.length < 2) return null;

    return {
      previous: hrefs[index - 1] || null,
      next: hrefs[index + 1] || null,
    };
  } catch {
    return null;
  }
}

export function getUserDetailsSequenceHref(type, id) {
  return normalizeDetailsHref(`/details/${type}/${id}`);
}
