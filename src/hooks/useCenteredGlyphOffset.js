// src/hooks/useCenteredGlyphOffset.js
"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { getGlyphCenterOffset } from "@/lib/ui/measureGlyphOffset";

/**
 * `ref` (a asignar al <span> del número) + `offsetPx` (a aplicar como
 * `transform: translateY(offsetPx)`) para centrar VISUALMENTE `text` --
 * dígitos, coma decimal, "%"... ver `measureGlyphOffset` para el porqué hace
 * falta medir en vez de usar un desplazamiento fijo -- dentro de su caja.
 *
 * Se recalcula si cambia el texto, si el elemento cambia de tamaño
 * (ResizeObserver: cubre el salto de tamaño de fuente entre el breakpoint
 * móvil y el de escritorio, resuelto por container queries) y una vez más
 * cuando las fuentes terminan de cargar (`document.fonts.ready`), por si la
 * primera medición se hizo con una fuente de reserva. Empieza en 0 (sin
 * offset) hasta la primera medición para que la salida del primer render en
 * cliente coincida con el HTML de servidor -- `useLayoutEffect` corrige antes
 * de pintar, así que no hay parpadeo visible.
 */
export function useCenteredGlyphOffset(text) {
  const ref = useRef(null);
  const [offsetPx, setOffsetPx] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !text) {
      setOffsetPx(0);
      return undefined;
    }

    const measure = () => {
      const cs = window.getComputedStyle(el);
      const font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      setOffsetPx(getGlyphCenterOffset(font, text));
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);

    let cancelled = false;
    document.fonts?.ready?.then(() => {
      if (!cancelled) measure();
    });

    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [text]);

  return { ref, offsetPx };
}
