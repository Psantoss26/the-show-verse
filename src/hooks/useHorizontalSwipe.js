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
 * Handlers táctiles en fase de captura para el contenedor que debe responder a
 * deslizamientos horizontales.
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
  shouldStart,
  suppressClickAfterSwipe = true,
} = {}) {
  const startRef = useRef(null);
  const suppressClickUntilRef = useRef(0);

  if (!enabled) return {};

  const cancel = () => {
    startRef.current = null;
  };

  return {
    // Misma estrategia que la navegación horizontal de Perfil: la captura
    // recibe el inicio y el final aunque el dedo haya empezado sobre un botón
    // del menú. Con Pointer Events algunos navegadores cancelan la secuencia
    // al resolver su propio gesto de desplazamiento y nunca llega el `pointerup`.
    onTouchStartCapture: (event) => {
      if (event.touches.length !== 1) {
        cancel();
        return;
      }
      if (shouldStart && !shouldStart(event)) {
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
    // Un arrastre claramente vertical es scroll de página, no un cambio de
    // sección. Lo descartamos pronto para no interpretar su final como swipe.
    onTouchMoveCapture: (event) => {
      const start = startRef.current;
      if (!start || event.touches.length !== 1) {
        cancel();
        return;
      }

      const touch = event.touches[0];

      const deltaX = Math.abs(touch.clientX - start.x);
      const deltaY = Math.abs(touch.clientY - start.y);
      if (Math.max(deltaX, deltaY) < MIN_DISTANCE_PX) return;
      if (deltaY > deltaX * MAX_OFF_AXIS_RATIO) cancel();
    },
    onTouchEndCapture: (event) => {
      const start = startRef.current;
      cancel();
      const touch = event.changedTouches?.[0];
      if (!start || event.changedTouches.length !== 1 || !touch) return;

      const direction = getHorizontalSwipeDirection({
        startX: start.x,
        startY: start.y,
        startTime: start.time,
        endX: touch.clientX,
        endY: touch.clientY,
        endTime: Date.now(),
      });
      if (!direction) return;

      const handled =
        direction === "left" ? onSwipeLeft?.() : onSwipeRight?.();

      // Un gesto que no puede completar ninguna acción (por ejemplo, intentar
      // ir más allá del primer o último título) no debe comerse el siguiente
      // toque. Las pestañas conservan el comportamiento anterior por defecto.
      if (suppressClickAfterSwipe && handled !== false) {
        suppressClickUntilRef.current = Date.now() + 800;
      }
    },
    onTouchCancelCapture: cancel,
    onClickCapture: (event) => {
      if (Date.now() > suppressClickUntilRef.current) return;
      suppressClickUntilRef.current = 0;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}
