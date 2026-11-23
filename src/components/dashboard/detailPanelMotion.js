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
