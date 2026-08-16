"use client";

import { useRef } from "react";

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

const HISTORY_NAVIGATION_MARKER_KEY = "showverse:pending-history-navigation";
// La ficha de detalle puede resolver datos y renderizar antes de que vuelva a
// montar la lista. La marca escrita por ScrollRestoration conserva el destino
// exacto de `popstate`, por encima de una simple ventana de tiempo.
const HISTORY_WINDOW_MS = 10_000;
const HISTORY_MARKER_MAX_AGE_MS = 30_000;
let lastHistoryNavAt = -Infinity;
let installed = false;

function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  // `pageshow` con persisted = bfcache también cuenta como "volver" a la página.
  window.addEventListener("popstate", () => {
    lastHistoryNavAt = window.performance.now();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) lastHistoryNavAt = window.performance.now();
  });
}

install();

function hasPendingHistoryNavigation() {
  try {
    const raw = window.sessionStorage.getItem(HISTORY_NAVIGATION_MARKER_KEY);
    if (!raw) return false;

    const marker = JSON.parse(raw);
    const age = Date.now() - Number(marker?.at || 0);
    if (age < 0 || age > HISTORY_MARKER_MAX_AGE_MS) {
      window.sessionStorage.removeItem(HISTORY_NAVIGATION_MARKER_KEY);
      return false;
    }

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

// ¿El momento actual está dentro de la ventana posterior a una navegación de
// historial? (lectura puntual, no reactiva).
export function isHistoryNavigation() {
  if (typeof window === "undefined") return false;
  return (
    window.performance.now() - lastHistoryNavAt < HISTORY_WINDOW_MS ||
    hasPendingHistoryNavigation()
  );
}

// Captura el valor en el PRIMER render del componente (su montaje) y lo mantiene
// estable durante toda su vida. Como las páginas re-montan al navegar, el valor
// refleja si ESTE montaje proviene de atrás/adelante. Úsalo para:
//   - saltar la animación de entrada:  initial={isBack ? false : "hidden"}
//   - renderizar el contenido completo: useState(isBack ? full : chunkInicial)
export function useIsHistoryNavigation() {
  const ref = useRef(null);
  if (ref.current === null) ref.current = isHistoryNavigation();
  return ref.current;
}

// ¿Debe MANTENERSE CONGELADO el orden actual del contenido?
//
// Problema: al VOLVER (atrás/adelante) a una página cuyo contenido está ordenado
// (p. ej. por mejor valoración), las puntuaciones/fechas que gobiernan el orden se
// refrescan de forma asíncrona tras el montaje; el memo de ordenación recalcula y
// las tarjetas (con `layout` de framer-motion) se DESLIZAN a su nueva posición. El
// usuario ve cómo los títulos "se reordenan" después de mostrarse la página.
//
// Regla de negocio: el contenido se ordena UNA sola vez —cuando el usuario cambia
// el tipo de ordenación— y debe permanecer FIJO al volver a la página.
//
// Este hook devuelve `true` mientras: (1) el montaje proviene de atrás/adelante y
// (2) los controles de orden NO han cambiado desde el montaje. Pásale una clave que
// represente el estado de ordenación (p. ej. `${sortBy}|${groupBy}`). En cuanto el
// usuario cambia la ordenación, la clave cambia y deja de congelar, de modo que el
// reordenamiento vuelve a permitirse solo ante una acción explícita del usuario.
//
// Úsalo para saltar los refrescos asíncronos que reordenan:
//   const freezeOrder = useBackNavOrderFreeze(`${sortBy}|${groupBy}`);
//   useEffect(() => { if (freezeOrder) return; loadScores(); }, [items, freezeOrder]);
export function useBackNavOrderFreeze(orderingKey) {
  const isBackNav = useIsHistoryNavigation();
  const capturedRef = useRef(false);
  const initialKeyRef = useRef(undefined);
  if (!capturedRef.current) {
    capturedRef.current = true;
    initialKeyRef.current = String(orderingKey);
  }
  return isBackNav && initialKeyRef.current === String(orderingKey);
}
