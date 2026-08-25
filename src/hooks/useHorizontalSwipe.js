"use client";

import { useRef } from "react";

// Umbrales del gesto, elegidos para no pelearse con el scroll de la página:
//   - 48px: por encima del temblor del dedo al pulsar un botón, muy por debajo
//     de un barrido de pantalla completa.
//   - 0.6 de desvío vertical: el scroll vertical casi nunca sale recto, así que
//     se le deja deriva lateral antes de considerarlo un deslizamiento; a
//     partir de ahí el gesto se descarta y la página sigue desplazándose.
//   - 700ms: un arrastre lento es alguien buscando dónde apoyar el dedo para
//     hacer scroll, no un cambio de sección.
const MIN_DISTANCE_PX = 48;
const MAX_OFF_AXIS_RATIO = 0.6;
const MAX_DURATION_MS = 700;

/**
 * Handlers táctiles (`onTouchStart` / `onTouchMove` / `onTouchEnd` /
 * `onTouchCancel`) para spreadear sobre el contenedor que debe responder a
 * deslizamientos horizontales.
 *
 * NO llama a `preventDefault`: el gesto se decide al LEVANTAR el dedo mirando
 * lo recorrido, de modo que mientras tanto el navegador conserva el scroll
 * vertical y el pinch-zoom intactos. El contenedor puede complementar esto con
 * `touch-action: pan-y` cuando quiera priorizar explícitamente el scroll
 * vertical de la página.
 *
 * Con `enabled: false` devuelve un objeto vacío: el contenedor se queda sin
 * listeners (escritorio) en vez de registrarlos para no usarlos.
 */
export default function useHorizontalSwipe({
  onSwipeLeft,
  onSwipeRight,
  enabled = true,
} = {}) {
  const startRef = useRef(null);

  if (!enabled) return {};

  const cancel = () => {
    startRef.current = null;
  };

  return {
    onTouchStart: (event) => {
      if (event.touches.length !== 1) {
        cancel();
        return;
      }
      const touch = event.touches[0];
      startRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      };
    },
    // Un segundo dedo es un zoom, no un deslizamiento.
    onTouchMove: (event) => {
      if (event.touches.length > 1) cancel();
    },
    onTouchEnd: (event) => {
      const start = startRef.current;
      cancel();
      if (!start) return;

      const touch = event.changedTouches?.[0];
      if (!touch) return;

      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      const distance = Math.abs(deltaX);

      if (distance < MIN_DISTANCE_PX) return;
      if (Math.abs(deltaY) > distance * MAX_OFF_AXIS_RATIO) return;
      if (Date.now() - start.time > MAX_DURATION_MS) return;

      if (deltaX < 0) onSwipeLeft?.();
      else onSwipeRight?.();
    },
    onTouchCancel: cancel,
  };
}
