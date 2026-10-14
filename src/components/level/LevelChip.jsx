// src/components/level/LevelChip.jsx
// Nivel reducido a su número, para donde solo hay sitio para una pista: filas
// de miembros (búsqueda, seguidores, siguiendo). El color del rango lo
// identifica; el nombre del rango queda en el tooltip y para lectores de
// pantalla.

import { tierVisual } from "@/lib/level/tiers.mjs";

export default function LevelChip({ level, tier, className = "" }) {
  if (!Number.isFinite(Number(level))) return null;
  const visual = tierVisual(tier);
  const shownLevel = Math.trunc(Number(level));

  return (
    <span
      className={`inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full px-2 text-xs font-bold leading-none tabular-nums ${visual.chip} ${className}`}
      title={`Nivel ${shownLevel} · ${visual.name}`}
    >
      <span className="sv-level-chip-label">
        <span className="sr-only">Nivel </span>
        {shownLevel}
        <span className="sr-only">, rango {visual.name}</span>
      </span>
    </span>
  );
}
