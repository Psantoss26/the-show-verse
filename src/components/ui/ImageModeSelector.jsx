"use client";

// Selector del modo de imagen de las tarjetas (póster vertical / backdrop
// horizontal) de las páginas de usuario: la MISMA forma que en Favoritos.
//  - `ImageModeSegmented`: escritorio, grupo de dos botones junto al de vista.
//  - `ImageModeSheetGroup`: grupo «Imagen» de la hoja de filtros móvil.
// Iconos de Favoritos: película = póster, pantalla = backdrop.

import { Film, MonitorPlay } from "lucide-react";
import { SheetOption, SheetOptionGroup } from "@/components/ui/MobileOptionsSheet";

const ACCENTS = {
  emerald: {
    active: "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20",
  },
  orange: {
    active: "bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/20",
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

// Hoja de filtros móvil (MobileOptionsSheet): las dos opciones a la vista.
export function ImageModeSheetGroup({ value, onChange }) {
  return (
    <SheetOptionGroup label="Imagen" icon={Film}>
      <SheetOption icon={Film} active={value !== "backdrop"} onClick={() => onChange("poster")}>
        Portada
      </SheetOption>
      <SheetOption icon={MonitorPlay} active={value === "backdrop"} onClick={() => onChange("backdrop")}>
        Fondo
      </SheetOption>
    </SheetOptionGroup>
  );
}
