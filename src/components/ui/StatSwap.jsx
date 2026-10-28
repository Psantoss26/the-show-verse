"use client";

import { AnimatePresence, motion } from "framer-motion";

// Relevo animado de una pieza de `PageStatCard` (icono, cifra o etiqueta):
// cuando cambia `swapKey`, lo anterior sale hacia arriba difuminándose y lo
// nuevo entra desde abajo, sin volver a montar la tarjeta. `popLayout` saca de
// la maqueta lo que sale, así que las dos piezas no se apilan ni la tarjeta
// cambia de alto durante el relevo. Con la misma clave no anima nada: en el
// primer pintado la pieza sale quieta (`initial={false}`).
export default function StatSwap({ swapKey, className = "", children }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={swapKey}
        className={className}
        initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: -10, filter: "blur(6px)" }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
      >
        {children}
      </motion.span>
    </AnimatePresence>
  );
}
