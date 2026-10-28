"use client";

import { useLayoutEffect, useState } from "react";
import { motion } from "framer-motion";

// Pastilla de la sección activa de un selector de secciones (Listas, En
// progreso · Completadas) que SE DESLIZA de un botón a otro en vez de saltar.
//
// Uso: el `<nav>` lleva `ref={navRef}` y `relative`, cada botón
// `data-section-key` y `relative z-10`, y el `indicator` va dentro del nav.
// Mientras no está medida (`ready` a false: HTML del servidor, primer render)
// el botón activo pinta su propio fondo, como antes.
//
// Entre páginas hermanas (/in-progress ↔ /completed) el selector se monta de
// nuevo; `groupId` recuerda dónde estaba la pastilla para que la nueva salga
// de ahí y se deslice hasta su botón. Solo si se acaba de dejar la otra (aún
// montada o desmontada hace un instante): al llegar desde otra página sale
// quieta. Los selectores ocultos (el de escritorio en móvil y al revés) miden
// 0 y no cuentan.
const HANDOFF_MAX_AGE_MS = 1500;
const lastByGroup = new Map(); // groupId → { key, left, width, leftAt }

const SLIDE = { type: "spring", stiffness: 420, damping: 38, mass: 0.9 };

function measure(nav, activeKey) {
  const button = nav?.querySelector(`[data-section-key="${activeKey}"]`);
  if (!button || !button.offsetWidth) return null;
  return {
    left: button.offsetLeft,
    top: button.offsetTop,
    width: button.offsetWidth,
    height: button.offsetHeight,
  };
}

export function useSlidingSectionIndicator({ navRef, activeKey, groupId, className = "" }) {
  // { from, to, instant }: `from` solo cuenta al montar la pastilla.
  const [box, setBox] = useState(null);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return undefined;

    const update = (instant) => {
      const next = measure(nav, activeKey);
      if (!next) return;
      setBox((prev) => {
        if (prev) {
          // Misma medida (el ResizeObserver avisa también al empezar a
          // observar): no se toca, para no cortar el deslizamiento en curso.
          const same = ["left", "top", "width", "height"].every((k) => prev.to[k] === next[k]);
          return same ? prev : { from: prev.from, to: next, instant };
        }
        const last = lastByGroup.get(groupId);
        const fresh =
          last &&
          last.key !== activeKey &&
          (last.leftAt == null || Date.now() - last.leftAt < HANDOFF_MAX_AGE_MS);
        return { from: fresh ? { ...next, left: last.left, width: last.width } : next, to: next, instant: false };
      });
      lastByGroup.set(groupId, { key: activeKey, left: next.left, width: next.width, leftAt: null });
    };

    update(false);
    // Los botones cambian de ancho sin cambiar de sección (títulos que se
    // recogen a icono, viewport): ahí la pastilla se recoloca sin animar.
    const observer = new ResizeObserver(() => update(true));
    observer.observe(nav);
    nav.querySelectorAll("[data-section-key]").forEach((button) => observer.observe(button));
    return () => observer.disconnect();
  }, [navRef, activeKey, groupId]);

  useLayoutEffect(
    () => () => {
      const last = lastByGroup.get(groupId);
      if (last?.key === activeKey) lastByGroup.set(groupId, { ...last, leftAt: Date.now() });
    },
    [groupId, activeKey],
  );

  const indicator = box ? (
    <motion.span
      aria-hidden="true"
      className={`pointer-events-none absolute left-0 top-0 rounded-xl ${className}`}
      style={{ top: box.to.top, height: box.to.height }}
      initial={{ x: box.from.left, width: box.from.width }}
      animate={{ x: box.to.left, width: box.to.width }}
      transition={box.instant ? { duration: 0 } : SLIDE}
    />
  ) : null;

  return { ready: box !== null, indicator };
}
