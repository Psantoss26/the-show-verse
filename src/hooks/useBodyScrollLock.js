"use client";

import { useEffect } from "react";

// Bloqueo de scroll del <body> mientras hay un modal abierto.
//
// Usa un CONTADOR global: el scroll solo se restaura cuando se cierran TODOS los
// modales (evita que cerrar uno reactive el scroll con otro aún abierto, p. ej.
// un modal que abre otro encima). Compensa el ancho de la barra de scroll con
// padding-right para que la página no "salte" al abrir/cerrar.
//
// Uso:  useBodyScrollLock(open)   // se bloquea mientras `active` sea true.

let lockCount = 0;
let saved = null; // { overflow, paddingRight } del body antes del primer bloqueo

export default function useBodyScrollLock(active = true) {
  useEffect(() => {
    if (!active || typeof document === "undefined") return undefined;

    const { body } = document;

    if (lockCount === 0) {
      const scrollBarWidth =
        window.innerWidth - document.documentElement.clientWidth;
      // Guardamos los valores previos del body (no asumimos que estén vacíos).
      saved = {
        overflow: body.style.overflow,
        paddingRight: body.style.paddingRight,
      };
      body.style.overflow = "hidden";
      if (scrollBarWidth > 0) {
        body.style.paddingRight = `${scrollBarWidth}px`;
      }
    }
    lockCount += 1;

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0 && saved) {
        body.style.overflow = saved.overflow;
        body.style.paddingRight = saved.paddingRight;
        saved = null;
      }
    };
  }, [active]);
}
