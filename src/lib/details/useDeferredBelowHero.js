"use client";

import { startTransition, useEffect, useState, useSyncExternalStore } from "react";

// Secciones de la ficha (Temporadas, Reparto, Recomendaciones, Media,
// Comentarios…) un fotograma después de la cabecera, en el MÓVIL y solo al
// llegar navegando dentro de la app.
//
// Al tocar un título, React renderizaba la ficha entera en una sola
// transición antes de enseñar nada: medido en el build de producción con CPU
// ×4, ~1,2 s de hilo principal con la pantalla de carga (negra) o la página de
// antes congelada, la mayor parte en las secciones de debajo (carruseles,
// tarjetas, comentarios) y en su maquetación. En el teléfono la cabecera ocupa
// toda la pantalla (ver useMobileDetailsHero con `fitCover`), así que nada de
// eso se ve al llegar: se pinta primero la cabecera y las secciones entran,
// en transición, justo después del primer fotograma.
//
// En la carga completa (hidratación) se pinta todo a la vez, como en el
// servidor: `useSyncExternalStore` da `false` mientras hidrata. En tablet y
// escritorio las secciones asoman bajo la cabecera y tampoco se difieren.
const MOBILE_QUERY = "(max-width: 639px)";
const subscribeNever = () => () => {};

export default function useDeferredBelowHero() {
  const clientRender = useSyncExternalStore(subscribeNever, () => true, () => false);
  const [ready, setReady] = useState(
    () =>
      !clientRender ||
      typeof window === "undefined" ||
      !window.matchMedia?.(MOBILE_QUERY).matches,
  );

  useEffect(() => {
    if (ready) return undefined;
    let cancelled = false;
    // Doble rAF: el primero llega antes de pintar la cabecera; el segundo,
    // con ella ya en pantalla. Con tope por tiempo: con la pestaña oculta no
    // hay rAF.
    let second = 0;
    const reveal = () => {
      if (cancelled) return;
      cancelled = true;
      window.cancelAnimationFrame(first);
      window.cancelAnimationFrame(second);
      window.clearTimeout(fallback);
      startTransition(() => setReady(true));
    };
    const first = window.requestAnimationFrame(() => {
      second = window.requestAnimationFrame(reveal);
    });
    const fallback = window.setTimeout(reveal, 250);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(first);
      window.cancelAnimationFrame(second);
      window.clearTimeout(fallback);
    };
  }, [ready]);

  return ready;
}
