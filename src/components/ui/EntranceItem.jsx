"use client";

// src/components/ui/EntranceItem.jsx
// Entrada de cada tarjeta o fila con el mismo criterio que las páginas de
// usuario (Favoritos, Historial, secciones del Perfil): sube, aparece y escala,
// escalonada por índice (con tope para listas largas) y DESACTIVADA al volver
// atrás, porque la página se restaura estática. Solo se anima lo que cabe en
// pantalla (`animateWithin`); lo que ya estaba montado no se vuelve a animar,
// así que para repetir la entrada (otra vista, otra sección) quien lo usa
// cambia la `key` del contenedor.

import { motion } from "framer-motion";

import { useIsHistoryNavigation } from "@/lib/hooks/useIsHistoryNavigation";

export default function EntranceItem({
  as = "div",
  index = 0,
  total = 0,
  animateWithin = 24,
  className,
  children,
}) {
  const isBackNav = useIsHistoryNavigation();
  const animDelay = total > 30 ? Math.min(index * 0.015, 0.25) : index * 0.03;
  const shouldAnimate = !isBackNav && index < Math.max(1, animateWithin);
  const Component = as === "li" ? motion.li : motion.div;
  return (
    <Component
      className={className}
      initial={shouldAnimate ? { opacity: 0, y: 12, scale: 0.98 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.32,
        delay: shouldAnimate ? animDelay : 0,
        ease: [0.25, 0.1, 0.25, 1],
      }}
    >
      {children}
    </Component>
  );
}

// Nº de filas de una lista que cubren el alto de la pantalla, con margen (como
// `estimateVisibleCards`, se sobreestima: animar de más es inofensivo).
export function estimateVisibleRows(rowHeight = 72) {
  if (typeof window === "undefined") return 24;
  return Math.ceil(window.innerHeight / Math.max(40, rowHeight)) + 2;
}
