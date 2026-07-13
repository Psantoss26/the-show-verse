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

const HISTORY_WINDOW_MS = 1500;
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

// ¿El momento actual está dentro de la ventana posterior a una navegación de
// historial? (lectura puntual, no reactiva).
export function isHistoryNavigation() {
  if (typeof window === "undefined") return false;
  return window.performance.now() - lastHistoryNavAt < HISTORY_WINDOW_MS;
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
