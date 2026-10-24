// Anterior/siguiente entre temporadas o episodios (flechas de la fila de
// acciones y gesto móvil) SIN apagar la pantalla.
//
// Al cambiar de temporada Next pinta primero el loading de /details (una
// superficie oscura vacía) hasta que el servidor resuelve la página nueva: la
// pantalla se apagaba ~0,4-1 s entre una ficha y otra. Aquí se deja encima una
// copia visual de la ficha actual mientras llega la nueva y se funde cuando la
// nueva ya está montada y con sus imágenes de cabecera, igual que hace la
// secuencia de títulos de DetailsClient (detailsSequenceTransition.js).
const ROOT = "data-subroute-root";
const HREF = "data-subroute-href";
const FROZEN = "data-subroute-frozen";
const NAVIGATION_WAIT_MS = 8000;
const IMAGE_WAIT_MS = 150;
const FADE_MS = 140;
const ENTRANCE_GRACE_MS = 600;

let active = false;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Con la pestaña en segundo plano no hay fotogramas: el tope por tiempo evita
// que la copia se quede encima hasta que vuelva a verse.
const nextFrame = () =>
  Promise.race([new Promise((resolve) => requestAnimationFrame(() => resolve())), delay(50)]);
const isVisible = (element) => Boolean(element?.getClientRects().length);

function findRoot(href = null) {
  const selector = href ? `[${ROOT}][${HREF}="${href}"]` : `[${ROOT}]`;
  // Las pantallas vivas de la pila (OverlayRouteHost) están en display:none.
  return [...document.querySelectorAll(selector)].find(isVisible) || null;
}

// Un nodo clonado arranca de cero sus animaciones CSS: la copia repetía las
// entradas de la ficha (se apagaba entera y los botones volvían a aparecer uno
// a uno) justo al tocar, el parpadeo del gesto. La copia va sin animaciones
// (globals.css) y lo que estaba animándose se queda en su valor de ese
// instante (por ejemplo el fundido por scroll de la cabecera).
const FROZEN_PROPERTIES = ["opacity", "transform", "translate", "scale", "rotate", "filter", "clip-path"];

function markAnimatedNodes(root) {
  const frozen = [];
  for (const animation of document.getAnimations()) {
    const effect = animation.effect;
    const target = effect?.target;
    if (effect?.pseudoElement || !(target instanceof Element) || !root.contains(target)) continue;
    if (target.hasAttribute(FROZEN)) continue;
    const computed = getComputedStyle(target);
    target.setAttribute(FROZEN, String(frozen.length));
    frozen.push({ node: target, values: FROZEN_PROPERTIES.map((name) => [name, computed.getPropertyValue(name)]) });
  }
  return frozen;
}

function captureScreen(root) {
  const bounds = root.getBoundingClientRect();
  const frozen = markAnimatedNodes(root);
  const snapshot = root.cloneNode(true);
  frozen.forEach(({ node }) => node.removeAttribute(FROZEN));
  const frozenClones = snapshot.hasAttribute(FROZEN) ? [snapshot] : [];
  frozenClones.push(...snapshot.querySelectorAll(`[${FROZEN}]`));
  frozenClones.forEach((node) => {
    frozen[Number(node.getAttribute(FROZEN))]?.values.forEach(([name, value]) => {
      node.style.setProperty(name, value);
    });
    node.removeAttribute(FROZEN);
  });
  snapshot.removeAttribute(ROOT);
  snapshot.removeAttribute(HREF);
  snapshot.setAttribute("data-subroute-snapshot", "");
  snapshot.setAttribute("aria-hidden", "true");
  snapshot.inert = true;
  Object.assign(snapshot.style, {
    position: "absolute", top: `${bounds.top}px`, left: `${bounds.left}px`,
    width: `${bounds.width}px`, margin: "0", pointerEvents: "none",
  });
  snapshot.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
  // Copia solo visual: sin audio, vídeo ni iframes que arranquen.
  snapshot.querySelectorAll("audio, iframe").forEach((node) => node.remove());
  snapshot.querySelectorAll("video").forEach((node) => {
    node.removeAttribute("autoplay");
    node.removeAttribute("src");
    node.querySelectorAll("source").forEach((source) => source.remove());
  });
  const overlay = document.createElement("div");
  // Misma capa que la copia de la secuencia de títulos (por debajo del navbar),
  // pero un nivel más abajo: la barra inferior del móvil también es z-30 y,
  // al añadirse después, la copia la tapaba y la barra parpadeaba.
  overlay.className = "sv-sequence-snapshot";
  overlay.style.zIndex = "29";
  overlay.setAttribute("aria-hidden", "true");
  overlay.inert = true;
  overlay.append(snapshot);
  document.body.append(overlay);
  return overlay;
}

// Las imágenes de la primera pantalla de la ficha nueva (portada, fondo), con
// un tope corto: lo que tarde más termina de cargar ya a la vista.
async function waitForVisibleImages(root) {
  const tasks = [...root.querySelectorAll("img")]
    .filter((image) => {
      const rect = image.getBoundingClientRect();
      return rect.width > 0 && rect.top < innerHeight && rect.bottom > 0;
    })
    .map((image) => (image.complete ? Promise.resolve() : image.decode().catch(() => {})));
  await Promise.race([Promise.allSettled(tasks), delay(IMAGE_WAIT_MS)]);
}

// La ficha nueva monta debajo de la copia con sus entradas de primera apertura
// (póster, logo, cascada de botones) a medias, o las arranca justo después
// (en episodios esperan a la portada): al fundirse la copia, los botones
// desaparecían y volvían a entrar uno a uno. Mientras dura el relevo y un
// margen corto después se dan por terminadas; las ligadas al scroll y las
// infinitas (brillo del cristal) siguen igual. Con setInterval y no rAF, que
// en segundo plano no corre.
function finishEntranceAnimations(root, duration) {
  const finish = () => {
    for (const animation of root.getAnimations({ subtree: true })) {
      if (animation.timeline !== document.timeline) continue;
      if (!Number.isFinite(animation.effect?.getComputedTiming().endTime)) continue;
      animation.finish();
    }
  };
  finish();
  const timer = setInterval(() => {
    if (root.isConnected) finish();
  }, 16);
  setTimeout(() => clearInterval(timer), duration);
}

export function isSubrouteHref(href) {
  return /^\/details\/tv\/[^/?#]+\/season\/[^/?#]+(?:\/episode\/[^/?#]+)?$/.test(href || "");
}

/**
 * Navega a `href` conservando la ficha actual a la vista hasta que la nueva
 * está lista. `navigate` es el `router.push` del llamador.
 */
export async function navigateSubrouteHolding({ href, navigate }) {
  const source = typeof document === "undefined" ? null : findRoot();
  if (active || !source || window.parent !== window) return navigate(href);

  active = true;
  const from = location.pathname;
  const overlay = captureScreen(source);
  let cancelled = false;
  const cancel = () => { cancelled = true; };
  window.addEventListener("popstate", cancel, { once: true });

  try {
    const opened = await navigate(href);
    if (opened === false) return false;
    const deadline = Date.now() + NAVIGATION_WAIT_MS;
    let incoming = null;
    while (!cancelled && Date.now() < deadline) {
      const route = location.pathname;
      if (route !== from && route !== href) break;
      incoming = findRoot(href);
      if (incoming) break;
      // Un error de ruta se enseña en cuanto aparece.
      if (route === href && document.querySelector("[data-details-error], .next-error-h1")) break;
      await nextFrame();
    }
    if (incoming && !cancelled) {
      finishEntranceAnimations(incoming, IMAGE_WAIT_MS + FADE_MS + ENTRANCE_GRACE_MS);
      await waitForVisibleImages(incoming);
      window.scrollTo({ top: 0, behavior: "instant" });
      await nextFrame();
      const fade = overlay.animate?.([{ opacity: 1 }, { opacity: 0 }], {
        duration: FADE_MS,
        easing: "ease-out",
        fill: "forwards",
      });
      await Promise.race([fade?.finished.catch(() => {}), delay(FADE_MS + 100)]);
    }
    return true;
  } finally {
    overlay.remove();
    window.removeEventListener("popstate", cancel);
    active = false;
  }
}
