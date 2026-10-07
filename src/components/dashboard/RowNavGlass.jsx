"use client";

import { motion } from "framer-motion";

// Fundido de entrada/salida de las piezas del botón lateral. Lo anima cada
// capa, NUNCA el botón: un `opacity` en un ancestro lo convierte en Backdrop
// Root y el desenfoque se queda inerte durante toda la transición.
// El botón propaga `initial="hidden" animate="visible" exit="hidden"`.
export const ROW_NAV_FADE = {
  hidden: { opacity: 0, transition: { duration: 0.25, ease: "easeOut" } },
  visible: { opacity: 1, transition: { duration: 0.3, ease: "easeOut" } },
};

// Desenfoque PROGRESIVO: tres capas de cristal cada vez más fuertes y más
// pequeñas, todas con máscara elíptica anclada al borde exterior (ver
// `.sv-nav-glass` en globals.css). Ninguna llega a los cantos del botón con
// alfa, así que no hay rectángulo que se vea, ni sobre imágenes claras.
const LAYERS = ["sv-nav-glass__b1", "sv-nav-glass__b2", "sv-nav-glass__b3", "sv-nav-glass__tint"];

export default function RowNavGlass({ side }) {
  return (
    <span aria-hidden="true" className="sv-nav-glass" data-side={side}>
      {LAYERS.map((layer) => (
        <motion.span key={layer} variants={ROW_NAV_FADE} className={layer} />
      ))}
    </span>
  );
}
