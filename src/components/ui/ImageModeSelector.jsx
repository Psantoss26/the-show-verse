"use client";

// Selector del modo de imagen de las tarjetas (póster vertical / backdrop
// horizontal) de las páginas de usuario: la MISMA forma que en Favoritos.
//  - `ImageModeSegmented`: escritorio, grupo de dos botones junto al de vista.
//  - `ImageModeToggleButton`: panel móvil, un botón cuadrado que alterna y se
//    ilumina con el acento de la página en modo backdrop.
// Iconos de Favoritos: película = póster, pantalla = backdrop.

import { Film, MonitorPlay } from "lucide-react";

const ACCENTS = {
  emerald: {
    active: "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20",
    glow: "text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]",
  },
};

const OPTIONS = [
  { value: "poster", label: "Póster", Icon: Film },
  { value: "backdrop", label: "Backdrop", Icon: MonitorPlay },
];

export function ImageModeSegmented({ value, onChange, accent = "emerald", className = "" }) {
  const colors = ACCENTS[accent] || ACCENTS.emerald;
  return (
    <div
      role="group"
      aria-label="Imagen de las tarjetas"
      className={`flex h-11 shrink-0 items-center gap-1 rounded-2xl p-1 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg ${className}`}
    >
      {OPTIONS.map(({ value: option, label, Icon }) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          title={label}
          aria-label={label}
          aria-pressed={value === option}
          className={`flex h-full items-center rounded-xl px-3 text-sm font-bold transition-all ${
            value === option ? colors.active : "text-zinc-400 hover:text-white hover:bg-white/10"
          }`}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}

export function ImageModeToggleButton({ value, onChange, accent = "emerald", className = "" }) {
  const colors = ACCENTS[accent] || ACCENTS.emerald;
  const backdrop = value === "backdrop";
  // Como en Favoritos: el icono es el del modo ACTUAL.
  const Icon = backdrop ? MonitorPlay : Film;
  const label = backdrop ? "Imagen: backdrop (cambiar a póster)" : "Imagen: póster (cambiar a backdrop)";
  return (
    <button
      type="button"
      onClick={() => onChange(backdrop ? "poster" : "backdrop")}
      title={label}
      aria-label={label}
      aria-pressed={backdrop}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-all bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg ${
        backdrop ? colors.glow : "text-zinc-200 hover:bg-black/30"
      } ${className}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
