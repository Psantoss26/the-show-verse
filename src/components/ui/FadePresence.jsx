"use client";

import { useEffect, useState } from "react";

// Duración de `sv-fade-out` en globals.css (+ margen). Si la animación no llega
// a disparar `animationend` (movimiento reducido, pestaña oculta), este tope
// desmonta igualmente.
const EXIT_FALLBACK_MS = 220;

// Aparición/desaparición con fundido POR CSS (`sv-fade-in` / `sv-fade-out`).
//
// Sustituye a <AnimatePresence> + motion.div en los overlays de confirmación de
// borrado. Con Framer Motion 12 la animación de opacidad dejaba, al terminar, un
// fotograma con el valor anterior: al abrir 0.99 → 0 → 1 y al cerrar
// 0 → 1 → desmontado. Eso era el microparpadeo del fondo negro. Aquí la salida
// termina con `forwards` (se queda a 0) y el nodo se desmonta después, así que
// no hay ningún fotograma intermedio visible.
//
// Uso:  <FadePresence show={confirmDel} className="absolute inset-0 …">…</FadePresence>
export default function FadePresence({ show, className = "", children, ...props }) {
  const [mounted, setMounted] = useState(show);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (show) {
      setMounted(true);
      setClosing(false);
      return undefined;
    }
    if (!mounted) return undefined;
    setClosing(true);
    const timer = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, EXIT_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [show, mounted]);

  if (!mounted) return null;

  return (
    <div
      {...props}
      // Cerrándose ya no acepta clics (p. ej. un segundo "Quitar").
      className={`${closing ? "sv-fade-out pointer-events-none" : "sv-fade-in"} ${className}`}
      onAnimationEnd={(event) => {
        props.onAnimationEnd?.(event);
        if (closing && event.target === event.currentTarget) {
          setMounted(false);
          setClosing(false);
        }
      }}
    >
      {children}
    </div>
  );
}
