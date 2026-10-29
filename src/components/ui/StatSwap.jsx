"use client";

import { AnimatePresence, motion } from "framer-motion";

const EASE = [0.4, 0, 0.2, 1];

// Lo que sale se apaga EN SU SITIO (sin desplazarse) y lo nuevo entra desde
// abajo justo cuando lo anterior ya casi no se ve: nunca se cruzan dos cifras.
const SWAP_MOTION = {
  initial: { opacity: 0, y: 8, filter: "blur(6px)" },
  animate: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.4, delay: 0.18, ease: EASE },
  },
  exit: {
    opacity: 0,
    filter: "blur(6px)",
    transition: { duration: 0.2, ease: EASE },
  },
};

// Relevo animado de una pieza de `PageStatCard` (icono, cifra o etiqueta):
// cuando cambia `swapKey`, lo anterior se desvanece y lo nuevo entra, sin
// volver a montar la tarjeta. Con la misma clave no anima nada: en el primer
// pintado la pieza sale quieta (`initial={false}`).
//
// Las dos piezas comparten la MISMA celda de una rejilla durante el relevo:
// el contenedor mide lo que la más ancha, ninguna se corta y la que sale no se
// mueve. Con `popLayout` la que salía pasaba a `absolute` y se recolocaba:
// la cifra vieja se desplazaba hacia la nueva y chocaba con los bordes, y la
// etiqueta quedaba limitada al ancho de la nueva y `truncate` la cortaba con
// «…». Centradas en la celda, el ajuste de ancho al terminar no se ve.
export default function StatSwap({ swapKey, className = "", children }) {
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
