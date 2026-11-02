// /src/lib/navigation/detailsWarmup.js
// Calentar la ficha (DetailsClient) en el móvil antes de que se toque un
// título. Ir a la ficha esperaba, a la par que la respuesta del servidor, a
// la descarga de los trozos de JS de la ficha (~220 kB comprimidos) y a su
// evaluación. Mientras tanto se veía `details/loading.jsx` (pantalla negra).
//
// - `warmDetailsChunks`: en reposo, una vez por visita, importa el módulo de
//   la ficha. Los trozos quedan descargados y evaluados para cuando la
//   navegación los pida.
// - `warmDetailsChunksOnPress`: al apoyar el dedo en un título, lo mismo si
//   aún no se había hecho. NO se precargan los datos de la ficha
//   (`router.prefetch` con `kind: "full"`): con la precarga en curso Next
//   espera a ella entera en vez de enseñar `details/loading.jsx`, y con el
//   servidor lento la página de antes se quedaba congelada segundos sin
//   respuesta al toque (medido: 3 s con 1,5 s de retardo en la respuesta).

const IDLE_TIMEOUT_MS = 4000;
let chunksWarmed = false;

const loadDetailsPage = () => import("@/components/DetailsPageLoader");

export function warmDetailsChunks() {
  if (chunksWarmed || typeof window === "undefined") return () => {};
  if (navigator.connection?.saveData) return () => {};
  const warm = () => {
    if (chunksWarmed) return;
    chunksWarmed = true;
    loadDetailsPage().catch(() => {
      // Sin red o despliegue nuevo: la navegación lo pedirá como siempre.
      chunksWarmed = false;
    });
  };
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(warm, { timeout: IDLE_TIMEOUT_MS });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(warm, 1500);
  return () => clearTimeout(id);
}

// Solo fichas de película o serie (DetailsClient).
const DETAILS_PATH = /^\/details\/(movie|tv)\/[^/]+\/?$/;

function isDetailsHref(href) {
  try {
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) return false;
    return DETAILS_PATH.test(url.pathname);
  } catch {
    return false;
  }
}

export function warmDetailsChunksOnPress(href) {
  if (chunksWarmed || !href || !isDetailsHref(href)) return;
  chunksWarmed = true;
  loadDetailsPage().catch(() => {
    chunksWarmed = false;
  });
}
