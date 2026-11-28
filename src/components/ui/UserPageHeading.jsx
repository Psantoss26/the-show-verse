// Bloque de título de las páginas de usuario: antetítulo, título con punto de
// color, botones junto al título (`actions`) y descripción. Mantiene el mismo
// marcado y medidas que tenía cada página a mano; lo nuevo es la jerarquía:
//  - antetítulo: línea de color que se dibuja y texto más espaciado;
//  - título: degradado blanco → tono de la página (PT Sans solo trae 700, así
//    que `font-black` pinta 700 igual que antes);
//  - descripción: más contraste y ancho de lectura.
// Con `animate={false}` (vuelta atrás, movimiento reducido) aparece quieto.
//
// En el móvil el título va SIEMPRE en una fila: se mide lo que ocupa a su
// tamaño base y, si no cabe junto a los botones, se reduce lo justo
// (`--fit`, nunca por encima del tamaño base). En escritorio no se toca.

"use client";

import { useLayoutEffect, useRef } from "react";
import SectionEyebrow from "./SectionEyebrow";

const MOBILE_QUERY = "(max-width: 767px)";

// `grad`: blanco a la izquierda que pasa al tono claro y acaba en el color de
// la página; `glow`: halo del mismo color detrás de las letras.
const ACCENTS = {
  red: { dot: "text-red-500", grad: "via-red-300 via-30% to-red-500 to-75%", glow: "drop-shadow-[0_0_28px_rgba(239,68,68,0.35)]" },
  blue: { dot: "text-blue-500", grad: "via-blue-300 via-30% to-blue-500 to-75%", glow: "drop-shadow-[0_0_28px_rgba(59,130,246,0.35)]" },
  emerald: { dot: "text-emerald-500", grad: "via-emerald-300 via-30% to-emerald-500 to-75%", glow: "drop-shadow-[0_0_28px_rgba(16,185,129,0.35)]" },
  purple: { dot: "text-purple-500", grad: "via-purple-300 via-30% to-purple-500 to-75%", glow: "drop-shadow-[0_0_28px_rgba(168,85,247,0.35)]" },
  pink: { dot: "text-pink-500", grad: "via-pink-300 via-30% to-pink-500 to-75%", glow: "drop-shadow-[0_0_28px_rgba(236,72,153,0.35)]" },
  yellow: { dot: "text-yellow-500", grad: "via-yellow-200 via-30% to-yellow-500 to-75%", glow: "drop-shadow-[0_0_28px_rgba(234,179,8,0.35)]" },
  orange: { dot: "text-orange-500", grad: "via-orange-300 via-30% to-orange-500 to-75%", glow: "drop-shadow-[0_0_28px_rgba(249,115,22,0.35)]" },
  amber: { dot: "text-amber-500", grad: "via-amber-300 via-30% to-amber-500 to-75%", glow: "drop-shadow-[0_0_28px_rgba(245,158,11,0.35)]" },
};

export default function UserPageHeading({
  eyebrow,
  title,
  description,
  accent = "red",
  actions = null,
  animate = true,
}) {
  const a = ACCENTS[accent] ?? ACCENTS.red;
  const rowRef = useRef(null);
  const titleRef = useRef(null);
  const textRef = useRef(null);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const h1 = titleRef.current;
    const text = textRef.current;
    if (!row || !h1 || !text) return undefined;
    const mq = window.matchMedia(MOBILE_QUERY);
    let frame = 0;

    const fit = () => {
      if (!mq.matches) {
        h1.style.removeProperty("--fit");
        return;
      }
      // Ancho natural al tamaño base: el medido dividido por el factor actual.
      const current = parseFloat(h1.style.getPropertyValue("--fit")) || 1;
      const natural = text.getBoundingClientRect().width / current;
      // Lo que deja la fila: su ancho menos los hermanos (botones) y el hueco.
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      let others = 0;
      for (const child of row.children) {
        if (child !== h1) others += child.getBoundingClientRect().width + gap;
      }
      const available = row.clientWidth - others;
      if (natural <= 0 || available <= 0) return;
      // Un 1 % de margen para que el redondeo no lo pase a dos filas.
      const next = Math.min(1, (available / natural) * 0.99);
      h1.style.setProperty("--fit", next.toFixed(4));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    };

    fit();
    const ro = new ResizeObserver(schedule);
    ro.observe(row);
    for (const child of row.children) if (child !== h1) ro.observe(child);
    mq.addEventListener("change", fit);
    // La fuente puede llegar después del primer cálculo.
    document.fonts?.ready?.then(schedule);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      mq.removeEventListener("change", fit);
    };
  }, [title]);

  return (
    <div className="sv-upage-heading" data-animate={animate ? "" : undefined}>
      {/* En el móvil el antetítulo se estrecha (línea más corta, menos
          espaciado) y el título crece: con 36 px y 0,28em medían casi lo
          mismo y competían. */}
      <SectionEyebrow accent={accent}>{eyebrow}</SectionEyebrow>
      <div ref={rowRef} className="flex items-center gap-4 md:gap-6">
        <h1
          ref={titleRef}
          className={`min-w-0 whitespace-nowrap md:whitespace-normal text-[calc(2.75rem*var(--fit,1))] leading-[1.05] md:text-6xl md:leading-none font-black tracking-tighter pb-1 -mb-1 bg-gradient-to-r from-white from-5% ${a.grad} bg-clip-text text-transparent ${a.glow}`}
        >
          <span ref={textRef} className="inline-block">
            {title}
            <span className={a.dot}>.</span>
          </span>
        </h1>
        {actions}
      </div>
      {description ? (
        <p className="mt-2 hidden max-w-xl text-pretty text-lg leading-relaxed text-zinc-300/80 md:block">
          {description}
        </p>
      ) : null}
    </div>
  );
}
