// Fondo animado de las páginas de usuario. Es el ÚNICO punto que lo define:
// cada página pasa su `variant` y el resto (colores, icono, pausas) vive aquí
// y en el bloque `.sv-upage-bg` de globals.css.
//
// Todas comparten la misma base, la de Favoritos: manchas de color que derivan
// y laten a doble golpe, una aurora, iconos desenfocados que suben y brasas.
// La variante solo cambia los colores y el icono, que es el de la página en la
// barra inferior: corazón (favorites), marcador (watchlist), ojo (history),
// play (progress), lista de vídeo (lists), carpeta (library), pantalla con
// play (continue), personas (social), calendario (calendar), brújula
// (discover) y persona (profile).
//
// Solo se anima `transform` y `opacity` (compositor, sin repintar). Se pausa
// con un modal o una vista lateral abiertos y desaparece el movimiento con
// `prefers-reduced-motion`.

"use client";

import { useEffect } from "react";

const EMBERS = Array.from({ length: 22 }, (_, i) => ({
  x: (i * 37 + 11) % 100,
  delay: -((i * 1.7) % 18),
  duration: 12 + ((i * 5) % 9),
  size: 2 + (i % 3),
  drift: ((i % 5) - 2) * 18,
}));

// Iconos desenfocados (bokeh) que suben muy despacio.
const ICONS = [
  { x: 6, size: 90, duration: 34, delay: -4, blur: 6, opacity: 0.14, rot: -14 },
  { x: 22, size: 46, duration: 26, delay: -18, blur: 2, opacity: 0.18, rot: 10 },
  { x: 41, size: 120, duration: 42, delay: -27, blur: 10, opacity: 0.1, rot: -6 },
  { x: 63, size: 58, duration: 30, delay: -9, blur: 3, opacity: 0.16, rot: 16 },
  { x: 78, size: 104, duration: 38, delay: -31, blur: 8, opacity: 0.12, rot: -10 },
  { x: 91, size: 40, duration: 24, delay: -14, blur: 2, opacity: 0.18, rot: 8 },
];

function Particles({ list, className }) {
  return list.map((p, i) => (
    <i
      key={i}
      className={className}
      style={{
        "--x": `${p.x}%`,
        "--d": `${p.duration}s`,
        "--delay": `${p.delay}s`,
        "--s": `${p.size}px`,
        "--drift": `${p.drift}px`,
      }}
    />
  ));
}

function Layer() {
  return (
    <>
      <div className="sv-upage-aurora" />
      {ICONS.map((h, i) => (
        <i
          key={i}
          className="sv-upage-icon"
          style={{
            "--x": `${h.x}%`,
            "--s": `${h.size}px`,
            "--d": `${h.duration}s`,
            "--delay": `${h.delay}s`,
            "--b": `${h.blur}px`,
            "--o": h.opacity,
            "--r": `${h.rot}deg`,
          }}
        />
      ))}
      <Particles list={EMBERS} className="sv-upage-ember" />
    </>
  );
}

export default function UserPageBackdrop({ variant = "favorites" }) {
  // Marca en <html> para que el cristal del navbar no sature el fondo de
  // color (ver `[data-sv-upage-bg] .sv-topbar-glass` en globals.css).
  // El valor es la variante: de ahí sale el tinte del cristal de los controles
  // de la página (`--upage-tint`, bloque «Cristal tintado» de globals.css).
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-sv-upage-bg", variant);
    return () => root.removeAttribute("data-sv-upage-bg");
  }, [variant]);

  return (
    <div
      aria-hidden="true"
      data-variant={variant}
      className="sv-upage-bg fixed inset-0 pointer-events-none overflow-hidden z-0"
    >
      <div className="sv-upage-blob sv-upage-blob--a" />
      <div className="sv-upage-blob sv-upage-blob--b" />
      <div className="sv-upage-blob sv-upage-blob--c" />
      <div className="sv-upage-fx">
        <Layer />
      </div>
      <div className="sv-upage-grain" />
    </div>
  );
}
