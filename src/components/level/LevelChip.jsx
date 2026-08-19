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
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] font-bold leading-none tabular-nums ${visual.chip} ${className}`}
      aria-label={`Nivel ${shownLevel}, rango ${visual.name}`}
      title={`Nivel ${shownLevel} · ${visual.name}`}
    >
      {/* Fotograma compacto: identifica el sistema de nivel sin competir con el usuario. */}
      <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
        <rect x="1" y="1" width="10" height="10" rx="1.75" fill="none" stroke="currentColor" strokeWidth="1.25" />
        <path d="M3 3.25h1.25M7.75 3.25H9M3 8.75h1.25M7.75 8.75H9" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
      <span className="sv-level-chip-label">
        Nivel <span className="text-white">{shownLevel}</span>
      </span>
    </span>
  );
}
