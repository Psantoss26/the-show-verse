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

export function getHorizontalSwipeDirection({
  startX,
  startY,
  startTime,
  endX,
  endY,
  endTime,
}) {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const distance = Math.abs(deltaX);

  if (distance < MIN_DISTANCE_PX) return null;
  if (Math.abs(deltaY) > distance * MAX_OFF_AXIS_RATIO) return null;
  if (endTime - startTime > MAX_DURATION_MS) return null;

  return deltaX < 0 ? "left" : "right";
}

/**
 * Handlers de puntero para spreadear sobre el contenedor que debe responder a
 * deslizamientos horizontales en pantalla táctil.
 *
 * NO llama a `preventDefault` durante el arrastre: el gesto se decide al
 * levantar el dedo mirando lo recorrido, de modo que el navegador conserva el
 * scroll vertical y el pinch-zoom. Tras un gesto válido sí se descarta el clic
 * sintético que el navegador emite sobre el botón donde terminó el dedo; sin
 * ello ese clic vuelve a seleccionar la pestaña original inmediatamente.
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
  const suppressClickUntilRef = useRef(0);

  if (!enabled) return {};

  const cancel = () => {
    startRef.current = null;
  };

  return {
    onPointerDown: (event) => {
      if (event.pointerType !== "touch" || !event.isPrimary) {
        cancel();
        return;
      }
      startRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        time: Date.now(),
      };
    },
    // Un arrastre claramente vertical es scroll de página, no un cambio de
    // sección. Lo descartamos pronto para no interpretar su final como swipe.
    onPointerMove: (event) => {
      const start = startRef.current;
      if (!start || event.pointerId !== start.pointerId) return;

      const deltaX = Math.abs(event.clientX - start.x);
      const deltaY = Math.abs(event.clientY - start.y);
      if (Math.max(deltaX, deltaY) < MIN_DISTANCE_PX) return;
      if (deltaY > deltaX * MAX_OFF_AXIS_RATIO) cancel();
    },
    onPointerUp: (event) => {
      const start = startRef.current;
      cancel();
      if (!start || event.pointerId !== start.pointerId) return;

      const direction = getHorizontalSwipeDirection({
        startX: start.x,
        startY: start.y,
        startTime: start.time,
        endX: event.clientX,
        endY: event.clientY,
        endTime: Date.now(),
      });
      if (!direction) return;

      suppressClickUntilRef.current = Date.now() + 800;
      if (direction === "left") onSwipeLeft?.();
      else onSwipeRight?.();
    },
    onPointerCancel: cancel,
    onClickCapture: (event) => {
      if (Date.now() > suppressClickUntilRef.current) return;
      suppressClickUntilRef.current = 0;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}
