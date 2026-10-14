// Detección de navegación de HISTORIAL (atrás/adelante del navegador o
// router.back()). Sirve para que las páginas de contenido se pinten ESTÁTICAS al
// volver a ellas: sin animación de entrada y con el contenido completo desde el
// primer frame, de modo que la altura del documento sea la correcta de inmediato
// y el <ScrollRestoration> restaure la posición sin saltos ni "chase".
//
// Mecanismo: el navegador emite `popstate` en cada navegación atrás/adelante
// (Next.js App Router también lo dispara). Guardamos el instante del último
// popstate; como al navegar las páginas RE-MONTAN, el primer render del nuevo
// componente cae dentro de una ventana breve tras ese popstate.
//
// Sin dependencias de Next ni de React (se testea con Node); los hooks están en
// lib/hooks/useIsHistoryNavigation.js.

const HISTORY_NAVIGATION_MARKER_KEY = "showverse:pending-history-navigation";
// La ficha de detalle puede resolver datos y renderizar antes de que vuelva a
// montar la lista. La marca escrita por ScrollRestoration conserva el destino
// exacto de `popstate`, por encima de una simple ventana de tiempo.
const HISTORY_WINDOW_MS = 10_000;
const HISTORY_MARKER_MAX_AGE_MS = 30_000;
let lastHistoryNavAt = -Infinity;
// Ruta a la que llevó ese `popstate`. Next renderiza la página de un enlace
// ANTES de su `pushState` (que es quien cancela la ventana), así que la
// ventana sola no basta: Pendientes, pulsada justo después de volver a
// Favoritos, se tomaba por vuelta atrás y salía sin animación de entrada.
let historyTargetPath = null;
let installed = false;

// PÁGINA actual del historial: ruta + query SIN `?preview=`.
//
// La ficha rápida (DetailModalProvider) vive en la MISMA página y usa el
// historial para su `?preview=`: al abrirla empuja una entrada y al cerrarla
// hace `history.go(-n)`, que emite `popstate`. Ese `popstate` no es volver a
// una página, pero se contaba como tal: durante los 10 s siguientes cualquier
// tarjeta o sección que montara (cambiar de vista, de agrupación o de
// pestaña, cargar más) se pintaba estática, SIN su animación de entrada.
const PREVIEW_PARAM = "preview";
let currentPageKey = null;
let lastPopStateStayedOnPage = false;

function readPageKey() {
  const params = new URLSearchParams(window.location.search);
  params.delete(PREVIEW_PARAM);
  const qs = params.toString();
  return `${window.location.pathname}${qs ? `?${qs}` : ""}`;
}

// Tras cada `pushState`/`replaceState` (los parchea <ScrollRestoration>).
export function syncHistoryPage() {
  if (typeof window === "undefined") return;
  currentPageKey = readPageKey();
}

// ¿El último `popstate` se quedó en la MISMA página (solo cambió `?preview=`)?
// Lo lee <ScrollRestoration>, cuyo listener corre después del de este módulo.
export function wasInPagePopState() {
  return lastPopStateStayedOnPage;
}

function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  currentPageKey = readPageKey();
  // `pageshow` con persisted = bfcache también cuenta como "volver" a la página.
  window.addEventListener("popstate", () => {
    const nextPageKey = readPageKey();
    lastPopStateStayedOnPage = nextPageKey === currentPageKey;
    currentPageKey = nextPageKey;
    if (lastPopStateStayedOnPage) return;
    lastHistoryNavAt = window.performance.now();
    historyTargetPath = window.location.pathname;
  });
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    lastHistoryNavAt = window.performance.now();
    historyTargetPath = window.location.pathname;
  });
}

install();

function hasPendingHistoryNavigation(pathname) {
  try {
    const raw = window.sessionStorage.getItem(HISTORY_NAVIGATION_MARKER_KEY);
    if (!raw) return false;

    const marker = JSON.parse(raw);
    const age = Date.now() - Number(marker?.at || 0);
    if (age < 0 || age > HISTORY_MARKER_MAX_AGE_MS) {
      window.sessionStorage.removeItem(HISTORY_NAVIGATION_MARKER_KEY);
      return false;
    }

    // La ruta que se renderiza debe ser la de la URL actual (si no, es la de un
    // enlace aún sin `pushState`) y coincidir con el destino de la vuelta.
    if (pathname !== window.location.pathname) return false;
    const route = `${window.location.pathname}${window.location.search}`;
    return marker?.route === route;
  } catch {
    return false;
  }
}

// Una navegación NORMAL (pulsar un enlace, el desplegable del navbar,
// `router.push`) cancela la ventana de historial.
//
// Sin esto, la ventana de 10 s se aplicaba a cualquier montaje posterior a un
// `popstate`: si retrocedías y acto seguido entrabas a Favoritos o Pendientes
// desde el navbar, esa página se pintaba ESTÁTICA —sin su animación de
// entrada— pese a no ser una vuelta atrás. La ventana existe para tolerar que
// el remontaje de la lista llegue tarde tras el `popstate`, no para teñir las
// navegaciones que vengan después.
//
// Lo llama el parche de `pushState` de <ScrollRestoration>, que ya es el único
// sitio que intercepta las navegaciones de empuje (y allí mismo se limpia el
// marcador de sesión). Mantenerlo en UN solo punto evita dos parches
// compitiendo por `history.pushState`.
export function notifyPushNavigation() {
  lastHistoryNavAt = -Infinity;
}

// ¿La ruta `pathname` se está mostrando por una navegación de historial?
// (lectura puntual, no reactiva). Por defecto, la de la URL actual.
export function isHistoryNavigation(pathname) {
  if (typeof window === "undefined") return false;
  const path = pathname || window.location.pathname;
  return (
    (window.performance.now() - lastHistoryNavAt < HISTORY_WINDOW_MS &&
      path === historyTargetPath) ||
    hasPendingHistoryNavigation(path)
  );
}
