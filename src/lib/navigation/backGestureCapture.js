// /src/lib/navigation/backGestureCapture.js
// CAPTURA LIMPIA PARA EL GESTO DE ATRÁS DE ANDROID.
//
// Al deslizar desde el borde para volver, Chrome no enseña la página de
// destino: enseña una captura que hizo al salir de ella, y la sustituye por la
// página real al terminar. Esa captura se pide en cada `pushState` y sale del
// SIGUIENTE fotograma pintado. Next hace su `pushState` en el mismo commit que
// ya monta la pantalla nueva (HistoryUpdater, `useInsertionEffect`), así que la
// «página de usuario» que se capturaba era ya la ficha (su portada) o, saliendo
// desde la vista previa, la vista previa encima. Al volver, eso asomaba un
// instante antes de la página de verdad.
//
// Arreglo: antes de navegar a una ficha se empuja una entrada con la MISMA URL
// (`pushCleanBackEntry`, sin URL: Next no la toma por una navegación) mientras
// la página sigue tal cual, se deja pintar un fotograma (ese es el que se
// captura) y se navega. El `pushState` de Next desde esa entrada se convierte
// en `replaceState` (ScrollRestoration, `isCleanBackEntry`): el historial
// queda igual que antes (página → ficha) y la entrada de la página guarda la
// captura buena. La vista previa móvil (MobileTitlePeek) empuja la suya al
// abrirse, con la página aún sin ella.
//
// Solo en teléfonos táctiles, que son los que tienen el gesto.

const CLEAN_BACK_KEY = "svCleanBack";
const TOUCH_PHONE_QUERY = "(max-width: 767px) and (hover: none) and (pointer: coarse)";

export function isCleanBackEntry() {
  return typeof window !== "undefined" && Boolean(window.history.state?.[CLEAN_BACK_KEY]);
}

export function usesBackGestureCapture() {
  return typeof window !== "undefined" && window.matchMedia?.(TOUCH_PHONE_QUERY).matches === true;
}

// Empuja la entrada (si no se está ya en una). Devuelve si la ha empujado.
export function pushCleanBackEntry() {
  if (isCleanBackEntry()) return false;
  window.history.pushState({ ...window.history.state, [CLEAN_BACK_KEY]: true }, "");
  return true;
}

// ¿Lleva `href` a una ficha (/details/…) distinta de la página actual?
export function isDetailsNavigation(href) {
  try {
    const url = new URL(href, window.location.href);
    return (
      url.origin === window.location.origin &&
      url.pathname.startsWith("/details/") &&
      url.pathname + url.search !== window.location.pathname + window.location.search
    );
  } catch {
    return false;
  }
}

// Navega (`navigate`) tras dejar capturada la página tal cual: entrada propia y
// dos fotogramas (el primero ya está pintado cuando corre el segundo). Si para
// entonces otra cosa ya ha navegado, no se repite.
export function navigateWithCleanBackCapture(navigate) {
  pushCleanBackEntry();
  const from = window.location.href;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      if (window.location.href !== from || !isCleanBackEntry()) return;
      navigate();
    });
  });
}

// Una entrada nuestra a la que se llega con atrás/adelante (la navegación no
// llegó a hacerse, o se salió a otra página desde la vista previa) es la misma
// página: se salta. Mientras la vista previa tiene la suya abierta, la
// gestiona ella (`holdCleanBackEntry`).
let held = false;
let skipping = false;
export function holdCleanBackEntry(value) {
  held = value;
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    if (skipping) {
      skipping = false;
      return;
    }
    if (held || !isCleanBackEntry()) return;
    skipping = true;
    window.history.back();
  });
}
