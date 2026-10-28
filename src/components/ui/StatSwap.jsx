"use client";

import { AnimatePresence, motion } from "framer-motion";

const SWAP_MOTION = {
  initial: { opacity: 0, y: 10, filter: "blur(6px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -10, filter: "blur(6px)" },
  transition: { duration: 0.6, ease: [0.4, 0, 0.2, 1] },
};

// Relevo animado de una pieza de `PageStatCard` (icono, cifra o etiqueta):
// cuando cambia `swapKey`, lo anterior sale hacia arriba difuminándose y lo
// nuevo entra desde abajo, sin volver a montar la tarjeta. Con la misma clave
// no anima nada: en el primer pintado la pieza sale quieta (`initial={false}`).
//
// Por defecto (`popLayout`) lo que sale se saca de la maqueta, así que las dos
// piezas no se apilan ni la tarjeta cambia de alto durante el relevo.
//
// Con `stack` (las etiquetas) las dos piezas comparten la MISMA celda de una
// rejilla durante el relevo: el contenedor mide lo que la más ancha y ninguna
// se corta. Con `popLayout` la que salía, ya en `absolute`, quedaba limitada
// al ancho de la nueva y `truncate` la cortaba con «…» («Episodios» saliendo
// mientras entraba «Series»). Centradas en la celda, el ajuste de ancho al
// terminar no se ve.
export default function StatSwap({ swapKey, className = "", stack = false, children }) {
  if (stack) {
    return (
      <span className="grid max-w-full grid-cols-[minmax(0,auto)] justify-center justify-items-center">
        <AnimatePresence initial={false}>
          <motion.span key={swapKey} className={`[grid-area:1/1] ${className}`} {...SWAP_MOTION}>
            {children}
          </motion.span>
        </AnimatePresence>
      </span>
    );
  }
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span key={swapKey} className={className} {...SWAP_MOTION}>
        {children}
      </motion.span>
    </AnimatePresence>
  );
}
