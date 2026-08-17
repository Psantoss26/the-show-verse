// src/components/level/LevelChip.jsx
// Nivel en una línea, para donde solo hay sitio para una pista: filas de
// miembros, autores de reseñas, listas de seguidores.

import { tierVisual } from "@/lib/level/tiers.mjs";

export default function LevelChip({ level, tier, className = "" }) {
  if (!Number.isFinite(Number(level))) return null;
  const visual = tierVisual(tier);
  const shownLevel = Math.trunc(Number(level));

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold leading-none ${visual.chip} ${className}`}
      title={`Nivel ${shownLevel} · ${visual.name}`}
    >
      {/* Glifo de fotograma: la misma idea que la insignia grande, reducida a 8px */}
      <svg viewBox="0 0 10 12" className="h-3 w-2.5" aria-hidden="true">
        <rect x="0.6" y="0.6" width="8.8" height="10.8" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <rect x="1.9" y="3" width="1.3" height="1.6" rx="0.4" fill="currentColor" />
        <rect x="1.9" y="6.4" width="1.3" height="1.6" rx="0.4" fill="currentColor" />
        <rect x="6.8" y="3" width="1.3" height="1.6" rx="0.4" fill="currentColor" />
        <rect x="6.8" y="6.4" width="1.3" height="1.6" rx="0.4" fill="currentColor" />
      </svg>
      <span>
        <span className="sr-only">Nivel </span>
        {shownLevel}
      </span>
    </span>
  );
}
