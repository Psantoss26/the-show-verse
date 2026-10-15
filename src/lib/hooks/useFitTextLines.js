"use client";

import { useLayoutEffect, useRef } from "react";
import { isDrawerResizeActive, onDrawerResize } from "@/lib/ui/drawerResizeEvents";

// Mayor tamaño de letra (en px, entre `min` y `max`) con el que el texto cabe
// en `lines` líneas. Se pensó para títulos de episodio, que pueden ser larguísimos
// («Dónde está el brazo izquierdo. La defensa de Trost (Parte 5)»): con el
// tamaño fijo ocupaban 3-4 líneas y empujaban la fila de botones.
//
// - Se mide en un layout effect, antes de pintar: el título nunca se ve a un
//   tamaño y luego a otro.
// - Búsqueda binaria (≈5 medidas) en vez de bajar de píxel en píxel.
// - Se recalcula si cambia el ANCHO del contenedor (giro, ventana). Se observa
//   el padre, no el propio texto: su ancho depende del tamaño de letra y
//   observarlo se realimentaría.
// - Si ni al mínimo cabe, el `line-clamp` del elemento recorta el resto.
//
// El elemento debe tener `line-height` relativo al tamaño (p. ej. `leading-[1]`).
export default function useFitTextLines({
  lines = 2,
  min = 20,
  max = 36,
  deps = [],
} = {}) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const fits = (size) => {
      el.style.fontSize = `${size}px`;
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || size;
      // Margen de media línea: con interlineado ajustado los trazos de la
      // fuente sobresalen un poco de la caja de línea y `scrollHeight` crece
      // unos px sin que haya una línea más.
      return el.scrollHeight < lineHeight * (lines + 0.5);
    };

    const fit = () => {
      if (fits(max)) return;
      let lo = min;
      let hi = max;
      while (hi - lo > 0.5) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid;
        else hi = mid;
      }
      el.style.fontSize = `${Math.floor(lo)}px`;
    };

    fit();

    const container = el.parentElement;
    if (!container || typeof ResizeObserver === "undefined") return;
    let width = container.clientWidth;
    // Arrastrando el tirador del panel lateral (la ficha en el iframe del
    // panel de temporada/episodio), el ancho cambia en cada fotograma y cada
    // ajuste son ~5 medidas que fuerzan la maquetación: era lo que más
    // costaba del gesto. Se espera al final y se ajusta una vez.
    let pending = false;
    const refit = () => {
      // Antes de medir: leer el ancho ya fuerza la maquetación.
      if (isDrawerResizeActive()) {
        pending = true;
        return;
      }
      pending = false;
      if (container.clientWidth === width) return;
      width = container.clientWidth;
      fit();
    };
    const observer = new ResizeObserver(refit);
    observer.observe(container);
    const stopDrawerResize = onDrawerResize((active) => {
      if (!active && pending) refit();
    });
    return () => {
      observer.disconnect();
      stopDrawerResize();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, min, max, ...deps]);

  return ref;
}
