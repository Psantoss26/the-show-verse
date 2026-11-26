import { SHEET_ENTER_FRAMER, SHEET_EXIT_FRAMER } from "../../lib/ui/sectionSheetMotion.js";

// MOVIMIENTO DE LOS PANELES DE FICHA (DetailModal y el de temporada/episodio,
// SubrouteDetailsPanel): entrada y salida del modal centrado y del panel
// lateral, y la transición a la ficha completa. Compartido para que los dos
// paneles se muevan exactamente igual.

/* =============================== ANIMACIÓN =============================== */
export const backdropVariants = {
  hidden: { opacity: 0 },
  // El desenfoque acompaña al panel: entra y sale en el mismo tiempo que su
  // recorrido, para que no se asiente antes ni se quede colgado al cerrar.
  visible: {
    opacity: 1,
    transition: SHEET_ENTER_FRAMER,
  },
  navigate: {
    // El dim real se oculta durante la navegación; la capa temporal usa un
    // scrim sólido sin backdrop-filter para evitar restos del blur del modal.
    opacity: 0,
    transition: { duration: 0 },
  },
  exit: {
    opacity: 0,
    transition: SHEET_EXIT_FRAMER,
  },
};

// Panel anclado abajo (modal centrado de los dashboards): es una hoja pegada al
// borde inferior, así que entra subiendo desde FUERA de la pantalla y sale
// bajando hasta salir de ella. Así el recorrido es continuo de principio a fin.
//
// Antes: muelle con `y` + `scale` (de 86 px y 0.965 a la identidad) y salida
// con fundido. Medido fotograma a fotograma en el dashboard:
// - Motion anima `y`/`scale` en el HILO PRINCIPAL, y el montaje de la ficha lo
//   bloquea: el primer fotograma llegaba a los ~117 ms con el panel ya al 70 %
//   del recorrido (salto de 86 a 24 px) y había otro parón de ~167 ms.
// - El muelle dejaba una cola de ~250 ms moviéndose por debajo de 2 px, con
//   rebote final: se leía como que el panel no acababa de asentarse.
// - Aparecer ya a 86 px de su sitio y con opacidad 1 hacía que el canto
//   superior "brotara" de la nada en vez de entrar.
// - La salida fundía `opacity`, que convierte el panel en Backdrop Root: el
//   cristal de las tarjetas se apagaba desde el primer fotograma del cierre.
//
// Ahora se anima el `transform` completo (WAAPI nativo, en el compositor, como
// el drawer) con curvas sin rebote, y ni la entrada ni la salida tocan la
// opacidad. `switching` (bajar/subir en la pila de previews con el modal ya
// abierto) mantiene el fundido cruzado en el sitio: deslizar ahí dejaría ver
// el fondo entre ficha y ficha.
//
// Curvas y duraciones (2026-11-23): las de las vistas laterales de la ficha
// (SHEET_ENTER/SHEET_EXIT de lib/ui/sectionSheetMotion.js), para que todos
// los paneles se muevan igual. Ojo: la salida vuelve a ser un ease-in corto
// (260 ms), lo que antes se había cambiado por una curva que sale rápido y
// frena (ver la nota del drawer); fue elección expresa de Pablo.
const sheetTransform = "translate3d(0, 0, 0)";
const sheetHiddenTransform = "translate3d(0, 100%, 0)";
export const createPanelVariants = (reduceMotion) => ({
  hidden: (switching) => ({
    opacity: switching && !reduceMotion ? 0 : 1,
    transform: switching || reduceMotion ? sheetTransform : sheetHiddenTransform,
  }),
  visible: (switching) => ({
    opacity: 1,
    transform: sheetTransform,
    transition: reduceMotion
      ? { duration: 0 }
      : switching
        ? { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
        : SHEET_ENTER_FRAMER,
  }),
  navigate: {
    // El panel real se oculta: el movimiento visible lo hace un clon inerte
    // montado en body, independiente del ciclo de render de App Router.
    opacity: 0,
    transform: sheetTransform,
    transition: { duration: 0 },
  },
  exit: (switching) => ({
    opacity: switching && !reduceMotion ? 0 : 1,
    transform: switching || reduceMotion ? sheetTransform : sheetHiddenTransform,
    transition: reduceMotion
      ? { duration: 0 }
      : switching
        ? { duration: 0.16, ease: [0.4, 0, 1, 1] }
        : SHEET_EXIT_FRAMER,
  }),
});

// Placement "right" (páginas de usuario): drawer anclado al borde derecho que
// entra deslizándose desde la derecha hacia el centro, con el mismo ancho. Se
// anima solo `x` (transform en GPU); ease-out sin overshoot para que no asome
// hueco tras el borde derecho.
// `custom` = switching: true cuando se cambia de un título a otro con el drawer YA
// abierto. En ese caso NO se desliza (dejaría ver el fondo un instante): se hace un
// fundido cruzado en el sitio entre la ficha saliente y la entrante. En la apertura
// inicial (switching false) sí entra deslizando desde el borde derecho.
// Curva de apertura: [0.32, 0.72, 0, 1], la misma que usan las hojas de iOS y
// Vaul. Arranca rápido y asienta suave SIN overshoot (requisito: un rebote
// dejaría asomar hueco tras el borde derecho). Sustituye a [0.22, 1, 0.36, 1]
// (easeOutQuint), cuya cola era tan larga y lenta que el panel parecía seguir
// flotando al final en vez de asentarse.
//
// En la apertura NO se anima ya `opacity`: un drawer sólido que entra deslizando
// se lee más nítido y directo que uno que además aparece de la nada, y se anima
// una propiedad menos. El fundido se conserva SOLO para `switching` (cambio de
// título con el drawer abierto), donde el crossfade sí es el efecto buscado.
// CIERRE: también desacelera, como la apertura.
//
// Antes era un ease-in (`[0.32, 0, 0.67, 0]`, 240 ms): arranca casi parado y
// acelera al final. Medido fotograma a fotograma, en los primeros ~90 ms el
// panel se movía 2 px y en los 60 ms siguientes cruzaba media pantalla: se
// veía "quieto" y luego desaparecía de golpe, sin que se llegara a percibir el
// deslizamiento. Con una curva que sale rápido y frena, el movimiento se ve
// desde el primer fotograma y el recorrido entero se lee.
// (Historia: desde 2026-11-23 el drawer usa las curvas de las vistas
// laterales, SHEET_ENTER_FRAMER/SHEET_EXIT_FRAMER, también en la salida.)

// Animate the complete transform so Motion can use native WAAPI. Its `x`
// shorthand runs on the main thread and stalls whenever the detail data renders.
// Explicit identity transforms also keep title changes and interrupted exits
// from inheriting a partially translated position.
const drawerTransform = "translate3d(0, 0, 0)";
const drawerHiddenTransform = "translate3d(100%, 0, 0)";
export const createPanelVariantsRight = (reduceMotion) => ({
  hidden: (switching) => ({
    opacity: switching && !reduceMotion ? 0 : 1,
    transform: switching || reduceMotion ? drawerTransform : drawerHiddenTransform,
  }),
  visible: (switching) => ({
    opacity: 1,
    transform: drawerTransform,
    transition: reduceMotion
      ? { duration: 0 }
      : switching
        ? { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
        : SHEET_ENTER_FRAMER,
  }),
  navigate: {
    opacity: 0,
    transform: drawerTransform,
    transition: { duration: 0 },
  },
  exit: (switching) => ({
    opacity: switching ? 0 : 1,
    transform: switching || reduceMotion ? drawerTransform : drawerHiddenTransform,
    transition: reduceMotion
      ? { duration: 0 }
      : switching
        ? { duration: 0.16, ease: [0.4, 0, 1, 1] }
        : SHEET_EXIT_FRAMER,
  }),
});

export const DETAILS_ROUTE_TRANSITION_KEY = "showverse:details-route-transition";
export const DETAILS_ROUTE_REVEAL_MIN_MS = 500;
const DETAILS_ROUTE_CLEANUP_MS = 420;

export function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function nextAnimationFrame() {
  return new Promise((resolve) => window.requestAnimationFrame(resolve));
}

// Espera (best-effort) a que la ruta /details haya montado su superficie. El
// loading boundary ya expone [data-details-root], así que normalmente resuelve
// enseguida; el timeout evita que una navegación lenta deje una capa colgada.
export function waitForDetailsRoot(maxMs = 1800) {
  if (typeof document === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    const start = Date.now();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    const check = () => {
      if (document.querySelector("[data-details-root]")) return finish();
      if (Date.now() - start > maxMs) return finish();
      setTimeout(check, 8);
    };
    check();
  });
}

// Relevo drawer de páginas de usuario → ficha completa (DetailModal, vistas
// normal y teléfono). El velo es el arte del título, no una superficie negra,
// y se mantiene hasta que la ficha REAL tiene su imagen (no hasta
// `details/loading.jsx`, que es otra superficie oscura vacía): entonces funde
// sobre ella. Suelo corto, solo para que el arte termine de entrar.
export const DRAWER_TO_DETAILS_REVEAL_MIN_MS = 220;
export const DRAWER_TO_DETAILS_FADE_MS = 260;
// Si el fondo del destino aún no está elegido al pulsar (panel abierto hace un
// instante), se le espera como mucho esto antes de navegar.
export const DRAWER_TO_DETAILS_ART_WAIT_MS = 400;
const DRAWER_TO_DETAILS_MAX_WAIT_MS = 2200;

function sameDetailsPath(doc, href) {
  try {
    const target = new URL(href, doc.location.origin).pathname;
    return doc.location.pathname === target;
  } catch {
    return false;
  }
}

// ¿Está ya a la vista la ficha de `href` con su imagen principal? Las
// pantallas ocultas de la pila (OverlayRouteHost, `display:none`) no tienen
// cajas y no cuentan. Una ficha que no marca `data-details-sequence-ready`
// (temporada/episodio) cuenta como lista en cuanto se ve.
export function detailsContentReady(doc, href) {
  if (!doc || !sameDetailsPath(doc, href)) return false;
  for (const loading of doc.querySelectorAll('[data-details-root][aria-busy="true"]')) {
    if (loading.getClientRects().length > 0) return false;
  }
  let shown = false;
  for (const root of doc.querySelectorAll("[data-details-root], [data-subroute-root]")) {
    if (root.getClientRects().length === 0) continue;
    if (root.getAttribute("aria-busy") === "true") continue;
    const ready = root.getAttribute("data-details-sequence-ready");
    if (ready !== null && ready !== "true") return false;
    shown = true;
  }
  return shown;
}

// Un MutationObserver responde en la microtarea que sigue al commit de React
// que marca la imagen lista; un sondeo por setTimeout llegaba hasta ~300 ms
// tarde porque tras ese commit React sigue montando las secciones de debajo en
// tareas largas. El sondeo queda de respaldo (no rAF: con la pestaña en segundo
// plano no hay fotogramas y la capa se quedaría encima), con tope por tiempo.
export function waitForDetailsContent(href, maxMs = DRAWER_TO_DETAILS_MAX_WAIT_MS) {
  if (typeof document === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    const start = Date.now();
    let done = false;
    let timer = null;
    let observer = null;
    const finish = () => {
      if (done) return;
      done = true;
      observer?.disconnect();
      if (timer) clearTimeout(timer);
      resolve();
    };
    const check = () => {
      if (done) return;
      if (detailsContentReady(document, href) || Date.now() - start > maxMs) {
        finish();
        return;
      }
      timer = setTimeout(check, 50);
    };
    if (typeof MutationObserver === "function" && document.body) {
      observer = new MutationObserver(() => {
        if (detailsContentReady(document, href)) finish();
      });
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["data-details-sequence-ready", "aria-busy"],
      });
    }
    check();
  });
}

// La ficha que entra bajo el velo del drawer lo hace sin sus entradas CSS
// (`html[data-details-sequence-transition]`). Marcada como ya entrada, no las
// arranca al retirar esa marca, con la ficha ya a la vista (mismo atributo que
// usa Anterior/Siguiente).
export function markDetailsEntered(doc, href) {
  if (!doc) return;
  for (const root of doc.querySelectorAll("[data-details-root]")) {
    if (root.getClientRects().length === 0) continue;
    if (href && root.getAttribute("data-details-href") !== href) continue;
    root.setAttribute("data-details-sequence-entered", "");
  }
}

export function cleanupFullDetailsTransitionLayers() {
  if (typeof document === "undefined") return;
  document
    .querySelectorAll("[data-details-route-transition]")
    .forEach((element) => element.remove());
}

// `decorateClone(clone)`: deja retocar el clon antes de animarlo. El panel de
// temporada/episodio pinta su ficha en un iframe, que no se puede clonar (y se
// retira del clon): ahí repone lo que se ve de él.
//
// `art`: el velo es el FONDO QUE PINTARÁ LA FICHA (variante `--art`), no una
// superficie negra: entra a pantalla completa mientras el panel se amplía y se
// difumina, y la capa entera funde sobre la ficha. `artSrc` es ese fondo si ya
// se conoce; si no, el velo espera transparente (se ve la página de debajo) a
// que lo ponga `showArt(src)`.
// El clon de `cloneNode` nace con todo su desplazamiento a cero: con el panel
// bajado, el contenido saltaba arriba en el primer fotograma del relevo. Se
// anotan los elementos desplazados del original (mismo orden de árbol que el
// clon recién hecho) y se reponen con el clon ya en el documento, porque un
// nodo suelto no tiene cajas y no admite `scrollTop`. Devuelve esa reposición.
export function captureCloneScroll(source, clone) {
  const sourceNodes = [source, ...source.querySelectorAll("*")];
  const cloneNodes = [clone, ...clone.querySelectorAll("*")];
  const pending = [];
  sourceNodes.forEach((node, index) => {
    const target = cloneNodes[index];
    if (!target || (!node.scrollTop && !node.scrollLeft)) return;
    pending.push([target, node.scrollTop, node.scrollLeft]);
  });
  return () => {
    for (const [target, top, left] of pending) {
      target.scrollTop = top;
      target.scrollLeft = left;
    }
  };
}

// Insertar el clon arranca de nuevo las entradas CSS de sus hijos (los botones
// de acción repetían su aparición durante el relevo, y en el hilo principal).
// Se dejan en su estado final; las que siguen al desplazamiento (ScrollTimeline,
// otra línea de tiempo) quedan, y las infinitas no se pueden terminar.
export function settleCloneAnimations(clone, timeline) {
  for (const animation of clone.getAnimations?.({ subtree: true }) || []) {
    if (animation.timeline !== timeline) continue;
    try {
      animation.finish();
    } catch {
      // Animación infinita (spinner): se queda como está.
    }
  }
}

export function startFullDetailsTransition(panelElement, variant = "center", { decorateClone, art = false, artSrc = null } = {}) {
  if (typeof document === "undefined" || !panelElement) return null;

  cleanupFullDetailsTransitionLayers();

  const rect = panelElement.getBoundingClientRect();
  const layer = document.createElement("div");
  layer.className = "sv-detail-route-transition";
  // El drawer derecho no sale hacia abajo: la tarjeta se AMPLÍA hacia dentro y se
  // difumina para morfear a la ficha completa (ver CSS --right).
  if (variant === "right") {
    layer.classList.add("sv-detail-route-transition--right");
  }
  layer.dataset.detailsRouteTransition = "true";
  layer.setAttribute("aria-hidden", "true");

  const scrim = document.createElement("div");
  scrim.className = "sv-detail-route-transition__scrim";
  const artVariant = Boolean(art || artSrc);
  let artShown = false;
  const showArt = (src) => {
    if (!artVariant || artShown) return;
    artShown = true;
    if (src) {
      const image = document.createElement("img");
      image.className = "sv-detail-route-transition__art";
      image.alt = "";
      image.decoding = "async";
      image.src = src;
      scrim.append(image);
    }
    layer.classList.remove("is-art-pending");
  };
  if (artVariant) {
    layer.classList.add("sv-detail-route-transition--art", "is-art-pending");
    if (artSrc) showArt(artSrc);
  }

  const panelClone = panelElement.cloneNode(true);
  const restoreCloneScroll = captureCloneScroll(panelElement, panelClone);
  panelClone.classList.add("sv-detail-route-transition__panel");
  panelClone.setAttribute("aria-hidden", "true");
  panelClone.style.setProperty("--sv-route-panel-top", `${rect.top}px`);
  panelClone.style.setProperty("--sv-route-panel-left", `${rect.left}px`);
  panelClone.style.setProperty("--sv-route-panel-width", `${rect.width}px`);
  panelClone.style.setProperty("--sv-route-panel-height", `${rect.height}px`);
  panelClone.style.viewTransitionName = "none";

  panelClone
    .querySelectorAll("iframe, video, audio")
    .forEach((mediaElement) => mediaElement.remove());
  panelClone
    .querySelectorAll("a, button, input, select, textarea, [tabindex]")
    .forEach((interactiveElement) => {
      interactiveElement.setAttribute("tabindex", "-1");
    });

  decorateClone?.(panelClone);

  layer.append(scrim, panelClone);
  document.body.append(layer);
  restoreCloneScroll();
  settleCloneAnimations(panelClone, document.timeline);

  layer.classList.add("is-running");

  let cleanupTimer = null;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (cleanupTimer) window.clearTimeout(cleanupTimer);
    layer.remove();
  };

  const reveal = () => {
    if (cleaned) return;
    layer.classList.add("is-revealing");
    cleanupTimer = window.setTimeout(
      cleanup,
      artVariant ? DRAWER_TO_DETAILS_FADE_MS + 40 : DETAILS_ROUTE_CLEANUP_MS,
    );
  };

  return { reveal, cleanup, showArt };
}
