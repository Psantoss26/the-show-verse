// src/components/level/LevelBadge.jsx
// La insignia de nivel: un fotograma de celuloide con sus perforaciones.
//
// La forma no es decorativa. Un hexágono de videojuego no dice nada de este
// producto; un fotograma de 35 mm sí, y el número del nivel ocupa el lugar de la
// imagen. El color del marco es el del rango. Anton (ya empaquetada en el
// proyecto, hasta ahora sin usar) le da al numeral una voz condensada propia,
// distinta de la PT Sans del resto de la interfaz.

import { tierVisual } from "@/lib/level/tiers.mjs";

const SIZES = {
  sm: { box: "h-8 w-7", numeral: "text-[13px]", label: null, name: "text-sm" },
  md: { box: "h-14 w-11", numeral: "text-[25px]", label: "text-[10px]", name: "text-base" },
  lg: { box: "h-20 w-16", numeral: "text-[34px]", label: "text-[11px]", name: "text-lg" },
};

// Cuatro perforaciones por lado, como en la película real.
const PERFORATIONS = [12, 27, 42, 57];

export default function LevelBadge({
  level,
  tier,
  size = "md",
  showTierName = false,
  className = "",
}) {
  const visual = tierVisual(tier);
  const dims = SIZES[size] || SIZES.md;
  const shownLevel = Number.isFinite(Number(level)) ? Math.trunc(Number(level)) : 1;
  const gradientId = `sv-level-frame-${visual.name.toLowerCase().replace(/[^a-z]/g, "")}-${size}`;

  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <span className={`relative inline-block shrink-0 ${dims.box}`}>
        <svg
          viewBox="0 0 56 72"
          className="h-full w-full"
          role="img"
          aria-label={`Nivel ${shownLevel}, ${visual.name}`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={visual.hex} stopOpacity="0.28" />
              <stop offset="100%" stopColor={visual.hexDeep} stopOpacity="0.55" />
            </linearGradient>
          </defs>

          {/* Cuerpo del fotograma */}
          <rect
            x="1.5"
            y="1.5"
            width="53"
            height="69"
            rx="7"
            fill={`url(#${gradientId})`}
            stroke={visual.hex}
            strokeWidth="2.5"
          />
          {/* Ventana interior: donde iría la imagen del fotograma */}
          <rect
            x="12"
            y="8"
            width="32"
            height="56"
            rx="3"
            fill="#09090b"
            fillOpacity="0.55"
            stroke={visual.hex}
            strokeOpacity="0.35"
            strokeWidth="1"
          />
          {/* Perforaciones */}
          {PERFORATIONS.map((y) => (
            <g key={y}>
              <rect x="4.5" y={y - 4} width="5" height="8" rx="1.5" fill={visual.hex} fillOpacity="0.75" />
              <rect x="46.5" y={y - 4} width="5" height="8" rx="1.5" fill={visual.hex} fillOpacity="0.75" />
            </g>
          ))}
        </svg>

        {/* El numeral va en HTML, no en <text>, para heredar la fuente variable */}
        <span
          className={`pointer-events-none absolute inset-0 flex items-center justify-center font-black leading-none tracking-tight text-white ${dims.numeral}`}
          style={{ fontFamily: "var(--font-anton), var(--font-pt-sans), sans-serif" }}
          aria-hidden="true"
        >
          {shownLevel}
        </span>
      </span>

      {showTierName && dims.label && (
        <span className="min-w-0">
          <span className={`block font-bold uppercase tracking-[0.14em] text-zinc-400 ${dims.label}`}>
            Nivel {shownLevel}
          </span>
          <span className={`block truncate font-black tracking-tight ${dims.name} ${visual.accent}`}>
            {visual.name}
          </span>
        </span>
      )}
    </span>
  );
}
