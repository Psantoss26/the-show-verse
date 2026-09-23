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
// El montaje y el paso a "cerrándose" se deciden EN EL MISMO RENDER que cambia
// `show`, no en un efecto: un efecto corre después de pintar, y ese fotograma
// de más se veía. Al abrir, la tarjeta ya había ocultado su papelera y su
// título pero el overlay aún no existía (la portada "parpadeaba" sin nada
// encima); al cerrar, el overlay seguía un fotograma sin su clase de salida.
//
// Uso:  <FadePresence show={confirmDel} className="absolute inset-0 …">…</FadePresence>
export default function FadePresence({ show, className = "", children, ...props }) {
  const [rendered, setRendered] = useState(show);

  // Ajuste de estado durante el render (patrón admitido por React): se vuelve
  // a renderizar antes de confirmar, sin fotograma intermedio.
  if (show && !rendered) setRendered(true);

  const closing = rendered && !show;

  useEffect(() => {
    if (!closing) return undefined;
    const timer = window.setTimeout(() => setRendered(false), EXIT_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [closing]);

  if (!rendered) return null;

  return (
    <div
      {...props}
      // Cerrándose ya no acepta clics (p. ej. un segundo "Quitar").
      className={`${closing ? "sv-fade-out pointer-events-none" : "sv-fade-in"} ${className}`}
      onAnimationEnd={(event) => {
        props.onAnimationEnd?.(event);
        if (closing && event.target === event.currentTarget) setRendered(false);
      }}
    >
      {children}
    </div>
  );
}
