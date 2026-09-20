"use client";

// Esqueleto NEUTRO para la primerísima apertura de la ficha móvil del drawer
// (`MobileDetailsFrameStack`), cuando todavía no hay ningún título real que
// enseñar de respaldo. A propósito NO intenta imitar el póster/logo/botones
// finales: cualquier aproximación acaba viéndose sustituida por la ficha real
// -- ese cambio de aspecto ES el parpadeo que se quiere evitar -- así que es
// mejor un simple placeholder neutro, igual que el propio DetailModal usa
// mientras no tiene `hasHeroArt`.

import { motion } from "framer-motion";

export default function MobileDetailsPreviewOverlay() {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="absolute inset-0 z-10 animate-pulse bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900"
      aria-hidden="true"
    />
  );
}
