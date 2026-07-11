"use client";

import { useEffect } from "react";

// Bloqueo del scroll de la página mientras hay un modal abierto.
//
// Bloquea el ELEMENTO RAÍZ (<html>) además del <body>. Es imprescindible: con
// `html, body { overflow-x: clip }` global, el `overflow-y` de <html> computa a
// `auto`, así que el SCROLLER real es <html>, no el body. Poner solo
// `body{overflow:hidden}` NO bloqueaba la página (p. ej. en DetailsClient se
// seguía pudiendo hacer scroll con un modal abierto). También cortamos el
// scroll-chaining/rebote con `overscroll-behavior: none`.
//
// No compensamos el ancho de la scrollbar con padding: <html> lleva
// `scrollbar-gutter: stable` (globals.css), que reserva el hueco siempre, así
// que al ocultar la scrollbar la página no "salta".
//
// Usa un CONTADOR global: el scroll solo se restaura cuando se cierran TODOS los
// modales (un modal puede abrir otro encima; no se debe reactivar antes).
//
// Uso:  useBodyScrollLock(open)   // se bloquea mientras `active` sea true.

let lockCount = 0;
let saved = null; // valores previos de html/body antes del primer bloqueo

export default function useBodyScrollLock(active = true) {
  useEffect(() => {
    if (!active || typeof document === "undefined") return undefined;

    const { body, documentElement: html } = document;

    if (lockCount === 0) {
      // Guardamos los valores previos (no asumimos que estén vacíos).
      saved = {
        htmlOverflow: html.style.overflow,
        htmlOverscroll: html.style.overscrollBehavior,
        bodyOverflow: body.style.overflow,
      };
      html.style.overflow = "hidden";
      html.style.overscrollBehavior = "none";
      body.style.overflow = "hidden";
    }
    lockCount += 1;

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0 && saved) {
        html.style.overflow = saved.htmlOverflow;
        html.style.overscrollBehavior = saved.htmlOverscroll;
        body.style.overflow = saved.bodyOverflow;
        saved = null;
      }
    };
  }, [active]);
}
