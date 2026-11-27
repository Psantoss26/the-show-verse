"use client";

import { animate, motion, useMotionValue, useReducedMotion } from "framer-motion";
import { useEffect, useLayoutEffect, useRef } from "react";

// Mismo muelle que el `layout` de la cabecera (MotionConfig de las páginas).
const SURFACE_SPRING = { type: "spring", stiffness: 380, damping: 38, mass: 1 };

/**
 * Cristal de las cabeceras de agrupación (Favoritos, Pendientes).
 *
 * No usa `layout` de framer: escalar un nodo con `backdrop-filter` hace que
 * Chrome vuelva a rasterizar sus bordes cuando el transform acaba en `none`,
 * y los cantos superior e inferior cambian un píxel dos veces justo después
 * de compactarse. Aquí la superficie anima sus márgenes `right`/`bottom`
 * desde el tamaño anterior hasta 0 con el mismo muelle, sin escala.
 * El borde izquierdo y el superior siguen al padre (layout="position").
 */
export default function GroupSurface({ className = "", skipMotion = false }) {
  const ref = useRef(null);
  const prevSize = useRef(null);
  const controls = useRef([]);
  const right = useMotionValue(0);
  const bottom = useMotionValue(0);
  const reduceMotion = useReducedMotion();

  // Sin dependencias: igual que framer, compara el tamaño en cada render.
  useLayoutEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const before = prevSize.current;
    prevSize.current = { w: rect.width, h: rect.height };
    if (!before) return;
    const dw = rect.width - before.w;
    const dh = rect.height - before.h;
    if (Math.abs(dw) < 0.01 && Math.abs(dh) < 0.01) return;

    controls.current.forEach((c) => c.stop());
    controls.current = [];
    if (skipMotion || reduceMotion) {
      right.jump(0);
      bottom.jump(0);
      return;
    }
    // Mantiene el tamaño visible de este fotograma (también a mitad de otra
    // animación) y desde ahí vuelve a 0. `jump` y no `set`: `set` deja al
    // valor una velocidad enorme que `animate` hereda (crecía antes de
    // encoger).
    right.jump(right.get() + dw);
    bottom.jump(bottom.get() + dh);
    controls.current = [
      animate(right, 0, SURFACE_SPRING),
      animate(bottom, 0, SURFACE_SPRING),
    ];
  });

  useEffect(() => () => controls.current.forEach((c) => c.stop()), []);

  return (
    <motion.div
      ref={ref}
      aria-hidden="true"
      style={{ right, bottom, borderRadius: 16 }}
      className={`sv-group-surface pointer-events-none absolute left-0 top-0 ${className}`}
    />
  );
}
