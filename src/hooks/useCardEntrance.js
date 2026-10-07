"use client";

import { useLayoutEffect, useRef } from "react";

// Entrada de la tarjeta (fundido + leve escala) con Web Animations, UNA sola vez
// por tarjeta montada.
//
// No se usa la entrada de framer porque se repetía al reordenar: en desarrollo,
// StrictMode (React 19) vuelve a montar los efectos de las tarjetas que cambian
// de sitio y framer, al remontarse, reiniciaba desde sus valores iniciales
// (opacidad 0). La ref sobrevive a ese remontaje, así que aquí no se repite.
// `fill: "backwards"` mantiene la tarjeta oculta durante el retardo escalonado.
export default function useCardEntrance(
  ref,
  { enabled, delayS, durationS, fromTransform },
) {
  const playedRef = useRef(false);
  useLayoutEffect(() => {
    if (playedRef.current) return;
    playedRef.current = true;
    const el = ref.current;
    if (!enabled || !el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    el.animate(
      [
        { opacity: 0, transform: fromTransform },
        { opacity: 1, transform: "none" },
      ],
      {
        duration: durationS * 1000,
        delay: delayS * 1000,
        easing: "cubic-bezier(0.25, 0.1, 0.25, 1)",
        fill: "backwards",
      },
    );
    // Solo al montar: la entrada no depende de cambios posteriores.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
