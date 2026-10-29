"use client";

import { AnimatePresence, motion } from "framer-motion";

const EASE_OUT = [0.22, 1, 0.36, 1];
const EASE_IN = [0.4, 0, 1, 1];
// Lo nuevo empieza cuando lo anterior ya casi no se ve: nunca se cruzan.
const ENTER_AFTER_EXIT = 0.14;

// Lo que sale se encoge un poco y se apaga EN SU SITIO (sin desplazarse); lo
// nuevo sube unos píxeles, crece y se enfoca. `delay` escalona el relevo entre
// piezas y tarjetas.
const swapMotion = (delay) => ({
  initial: { opacity: 0, y: 6, scale: 0.94, filter: "blur(4px)" },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: { duration: 0.42, delay: delay + ENTER_AFTER_EXIT, ease: EASE_OUT },
  },
  exit: {
    opacity: 0,
    scale: 0.9,
    filter: "blur(4px)",
    transition: { duration: 0.18, delay, ease: EASE_IN },
  },
});

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
export default function StatSwap({ swapKey, className = "", delay = 0, children }) {
  return (
    <span className="grid max-w-full grid-cols-[minmax(0,auto)] justify-center justify-items-center">
      <AnimatePresence initial={false}>
        <motion.span key={swapKey} className={`[grid-area:1/1] ${className}`} {...swapMotion(delay)}>
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
