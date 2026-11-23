// src/hooks/useCenteredGlyphOffset.js
"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { measureInkCenterShift } from "@/lib/ui/measureGlyphOffset";

const ZERO = { x: 0, y: 0 };

/**
 * `ref` (al elemento que contiene el número: un <span> o el grupo número+"%")
 * y `style` (su `transform`) para que la TINTA del texto quede centrada en los
 * dos ejes dentro del padre que la centra con flexbox. Ver
 * `measureInkCenterShift` para el porqué de medir en vez de fijar un ajuste.
 *
 * Se vuelve a medir si cambia `text`, si cambia el tamaño del elemento o del
 * botón (container queries por breakpoint, tamaños `md`/`lg`), y cuando
 * terminan de cargar las fuentes. Empieza sin desplazamiento para que el
 * primer render coincida con el HTML del servidor; `useLayoutEffect` corrige
 * antes de pintar.
 */
export function useCenteredGlyphOffset(text) {
  const ref = useRef(null);
  const appliedRef = useRef(ZERO);
  const [shift, setShift] = useState(ZERO);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !text) {
      appliedRef.current = ZERO;
      setShift(ZERO);
      return undefined;
    }

    const measure = () => {
      const next = measureInkCenterShift(el, appliedRef.current);
      if (!next) return;
      const prev = appliedRef.current;
      if (next.x === prev.x && next.y === prev.y) return;
      appliedRef.current = next;
      setShift(next);
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);

    let cancelled = false;
    document.fonts?.ready?.then(() => {
      if (!cancelled) measure();
    });

    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [text]);

  return {
    ref,
    style:
      shift.x || shift.y
        ? { transform: `translate(${shift.x}px, ${shift.y}px)` }
        : undefined,
  };
}
