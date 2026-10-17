"use client";

// /src/components/details/SectionTitle.jsx
// Encabezado de sección de la ficha: icono en su cajita, título y la línea que
// se ilumina al pasar por encima de la sección (`group/section`).
//
// Extraído de DetailsClient para que la ficha de TELÉFONO del DetailModal use
// EXACTAMENTE el mismo encabezado en vez de una imitación que se separaría al
// primer retoque.
//
// Con `onOpen`, el título es un botón (con «›») que abre la vista lateral de la
// sección completa (ver details/sectionSheet).
//
// `accent`: amarillo en las fichas de títulos; verde en la de un actor
// (ActorDetails). `subtitle` (bajo el título) y `right` (control al final de
// la fila, p. ej. el botón de filtros) solo los usa la ficha del actor.

import { ChevronRight } from "lucide-react";

// Clases completas por acento (Tailwind solo genera las que ve escritas).
const ACCENTS = {
  yellow: {
    box: "bg-yellow-500/5 shadow-[0_4px_24px_rgba(234,179,8,0.12)] group-hover/section:bg-yellow-500/10 group-hover/section:shadow-[0_8px_32px_rgba(234,179,8,0.2)]",
    boxGlow: "from-yellow-400/20",
    icon: "text-yellow-500 group-hover/section:text-yellow-400 drop-shadow-[0_2px_8px_rgba(234,179,8,0.4)]",
    focus: "focus-visible:outline-yellow-400",
    chevron: "text-yellow-500/70 group-hover/section:text-yellow-400",
    dot: "bg-yellow-500 shadow-[0_0_12px_rgba(234,179,8,1)]",
    line: "from-yellow-500",
  },
  emerald: {
    box: "bg-emerald-500/5 shadow-[0_4px_24px_rgba(16,185,129,0.12)] group-hover/section:bg-emerald-500/10 group-hover/section:shadow-[0_8px_32px_rgba(16,185,129,0.2)]",
    boxGlow: "from-emerald-400/20",
    icon: "text-emerald-500 group-hover/section:text-emerald-400 drop-shadow-[0_2px_8px_rgba(16,185,129,0.4)]",
    focus: "focus-visible:outline-emerald-400",
    chevron: "text-emerald-500/70 group-hover/section:text-emerald-400",
    dot: "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,1)]",
    line: "from-emerald-500",
  },
};

export default function SectionTitle({
  title,
  icon: Icon,
  className = "",
  onOpen = null,
  accent = "yellow",
  subtitle = null,
  right = null,
}) {
  const tone = ACCENTS[accent] || ACCENTS.yellow;
  const heading = (
    <h2 className="text-2xl sm:text-[28px] font-black tracking-tight text-white drop-shadow-md shrink-0 min-w-0">
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          aria-haspopup="dialog"
          aria-label={`${title}: ver todo`}
          className={`group/section-title flex items-center rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 ${tone.focus}`}
        >
          <span className="truncate">{title}</span>
          <ChevronRight
            aria-hidden="true"
            className={`ml-1 h-6 w-6 shrink-0 transition-transform duration-300 group-hover/section-title:translate-x-1 group-focus-visible/section-title:translate-x-1 sm:ml-2 sm:h-7 sm:w-7 ${tone.chevron}`}
          />
        </button>
      ) : (
        title
      )}
    </h2>
  );
  const line = (
    <div className="ml-2 sm:ml-4 flex-1 h-px bg-gradient-to-r from-white/20 via-white/5 to-transparent relative flex items-center">
      <div className={`absolute left-0 w-2 h-2 rounded-full opacity-40 group-hover/section:opacity-100 group-hover/section:scale-150 transition-all duration-500 ${tone.dot}`} />
      <div className={`absolute left-0 w-16 sm:w-24 h-[2px] bg-gradient-to-r to-transparent opacity-0 group-hover/section:opacity-100 transition-opacity duration-500 ${tone.line}`} />
    </div>
  );

  return (
    <div
      className={`flex items-center gap-3 sm:gap-4 mb-8 w-full ${className}`}
    >
      {Icon && (
        <div className={`relative flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-[14px] backdrop-blur-2xl shrink-0 overflow-hidden transition-all duration-500 ${tone.box}`}>
          <div className={`absolute inset-0 bg-gradient-to-br via-transparent to-transparent opacity-60 ${tone.boxGlow}`} />
          <div className="absolute inset-0 shadow-[inset_0_1px_2px_rgba(255,255,255,0.15),inset_0_-1px_2px_rgba(0,0,0,0.2)] rounded-[14px] pointer-events-none" />
          <Icon className={`relative z-10 w-5 h-5 sm:w-6 sm:h-6 group-hover/section:scale-110 transition-all duration-500 ${tone.icon}`} />
        </div>
      )}
      {subtitle ? (
        // Con subtítulo, título y línea en una fila y el subtítulo debajo.
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 items-center">
            {heading}
            {line}
          </div>
          <p className="mt-0.5 truncate text-xs font-semibold text-zinc-400 sm:text-sm">{subtitle}</p>
        </div>
      ) : (
        <>
          {heading}
          {line}
        </>
      )}
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}
