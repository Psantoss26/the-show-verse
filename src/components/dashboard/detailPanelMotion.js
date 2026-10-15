// MOVIMIENTO DE LOS PANELES DE FICHA (DetailModal y el de temporada/episodio,
// SubrouteDetailsPanel): entrada y salida del modal centrado y del panel
// lateral, y la transición a la ficha completa. Compartido para que los dos
// paneles se muevan exactamente igual.

/* =============================== ANIMACIÓN =============================== */
export const backdropVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.26, ease: [0.22, 1, 0.36, 1] },
  },
  navigate: {
    // El dim real se oculta durante la navegación; la capa temporal usa un
    // scrim sólido sin backdrop-filter para evitar restos del blur del modal.
    opacity: 0,
    transition: { duration: 0 },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.2, ease: [0.4, 0, 1, 1] },
  },
};

// Panel anclado abajo: entra como una hoja de preview y sale hacia la ficha.
// NO se anima `filter: blur` ni la opacidad de entrada: ambas propiedades
// atenuaban el liquid glass durante la carga. La hoja conserva su movimiento
// mediante y + scale, que se componen en GPU.
export const panelVariants = {
  hidden: { opacity: 1, y: 86, scale: 0.965 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 170,
      damping: 22,
      mass: 0.9,
    },
  },
  navigate: {
    // El panel real se oculta: el movimiento visible lo hace un clon inerte
    // montado en body, independiente del ciclo de render de App Router.
    opacity: 0,
    y: 0,
    scale: 1,
    transition: { duration: 0 },
  },
  exit: {
    opacity: 0,
    y: 52,
    scale: 0.985,
    transition: { duration: 0.18, ease: [0.4, 0, 1, 1] },
  },
};

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
const DRAWER_EASE_IN = [0.16, 1, 0.3, 1];
// CIERRE: también desacelera, como la apertura.
//
// Antes era un ease-in (`[0.32, 0, 0.67, 0]`, 240 ms): arranca casi parado y
// acelera al final. Medido fotograma a fotograma, en los primeros ~90 ms el
// panel se movía 2 px y en los 60 ms siguientes cruzaba media pantalla: se
// veía "quieto" y luego desaparecía de golpe, sin que se llegara a percibir el
// deslizamiento. Con una curva que sale rápido y frena, el movimiento se ve
// desde el primer fotograma y el recorrido entero se lee.
const DRAWER_EASE_OUT = [0.25, 0.8, 0.25, 1];
const DRAWER_EXIT_DURATION = 0.28;

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
    transition: {
      duration: reduceMotion ? 0 : switching ? 0.2 : 0.32,
      ease: switching ? [0.22, 1, 0.36, 1] : DRAWER_EASE_IN,
    },
  }),
  navigate: {
    opacity: 0,
    transform: drawerTransform,
    transition: { duration: 0 },
  },
  exit: (switching) => ({
    opacity: switching ? 0 : 1,
    transform: switching || reduceMotion ? drawerTransform : drawerHiddenTransform,
    transition: {
      duration: reduceMotion ? 0 : switching ? 0.16 : DRAWER_EXIT_DURATION,
      ease: switching ? [0.4, 0, 1, 1] : DRAWER_EASE_OUT,
    },
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

export function cleanupFullDetailsTransitionLayers() {
  if (typeof document === "undefined") return;
  document
    .querySelectorAll("[data-details-route-transition]")
    .forEach((element) => element.remove());
}

// `decorateClone(clone)`: deja retocar el clon antes de animarlo. El panel de
// temporada/episodio pinta su ficha en un iframe, que no se puede clonar (y se
// retira del clon): ahí repone lo que se ve de él.
export function startFullDetailsTransition(panelElement, variant = "center", { decorateClone } = {}) {
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

  const panelClone = panelElement.cloneNode(true);
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
    cleanupTimer = window.setTimeout(cleanup, DETAILS_ROUTE_CLEANUP_MS);
  };

  return { reveal, cleanup };
}
