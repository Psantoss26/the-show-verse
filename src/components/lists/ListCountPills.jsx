"use client";

import { Heart } from "lucide-react";

// Píldoras de recuento de una lista: cristal líquido teñido
// SIN bordes marcados (ni anillo ni reflejo `inset 0 1px`, que dibujan un filo):
// el volumen lo da el degradado del fondo y la elevación, un halo difuso del
// mismo tono.
const GLASS_COUNT_PILL_TONES = {
  purple:
    "bg-purple-500/[0.22] to-purple-950/[0.2] text-purple-100 shadow-[0_6px_18px_-8px_rgba(168,85,247,0.6)]",
  red:
    "bg-red-500/[0.22] to-red-950/[0.2] text-red-100 shadow-[0_6px_18px_-8px_rgba(239,68,68,0.6)]",
};

// PT Sans pinta las cifras y minúsculas 1 px por encima del centro de su caja
// de línea (medido a 1x: tinta de 6,5 a 14,5 en una píldora de 24 px); se baja
// ese píxel para que el texto quede centrado con el icono y en la píldora.
function GlassCountPillText({ children }) {
  return <span className="inline-block translate-y-px">{children}</span>;
}

// Items (morado) y me gusta (rojo, solo con 1 o más) de una lista. Se usan en
// /lists (cabecera de la vista de filas y pie de la rejilla) y en la sección
// Listas de la ficha (DetailsClient y PhoneDetailsSections).
export default function ListCountPills({ itemCount, likes }) {
  const likeCount = Number(likes) || 0;
  return (
    <>
      <GlassCountPill tone="purple">
        <span className="h-1.5 w-1.5 rounded-full bg-purple-400 shadow-[0_0_6px_rgba(192,132,252,0.9)]" />
        <GlassCountPillText>{Number(itemCount) || 0} items</GlassCountPillText>
      </GlassCountPill>
      {likeCount > 0 && (
        <GlassCountPill tone="red" title={`${likeCount} me gusta`}>
          {/* El corazón de lucide tiene el dibujo medio píxel por debajo
              del centro de su caja. */}
          <Heart aria-hidden="true" className="h-3 w-3 -translate-y-[0.5px] fill-current" />
          <GlassCountPillText>{likeCount}</GlassCountPillText>
        </GlassCountPill>
      )}
    </>
  );
}

function GlassCountPill({ tone = "purple", title, children }) {
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-br from-white/[0.12] via-transparent px-3 py-1 text-xs font-bold backdrop-blur-[14px] backdrop-saturate-[160%] ${GLASS_COUNT_PILL_TONES[tone]}`}
    >
      {children}
    </span>
  );
}
