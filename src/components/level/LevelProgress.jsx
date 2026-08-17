// src/components/level/LevelProgress.jsx
// Barra de experiencia hacia el siguiente nivel.

import { formatXp, tierVisual } from "@/lib/level/tiers.mjs";

export default function LevelProgress({ level, tier, progress, xp, className = "" }) {
  const visual = tierVisual(tier);
  const percent = Math.max(0, Math.min(100, Number(progress?.percent) || 0));
  const isMax = Boolean(progress?.isMax);
  const totalXp = Number.isFinite(Number(xp)) ? Number(xp) : Number(progress?.xp) || 0;

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        {/* La XP acumulada es el dato principal de la barra: va en blanco y sin
            versalitas, que a este tamaño son lo que más cuesta leer. */}
        <span className="text-sm font-black tabular-nums tracking-tight text-white">
          {formatXp(totalXp)} <span className="text-[11px] font-bold text-zinc-400">XP</span>
        </span>
        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
          {isMax
            ? "Nivel máximo"
            : `${formatXp(progress?.xpToNextLevel)} XP para el nivel ${Number(level) + 1}`}
        </span>
      </div>

      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.07]"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progreso hacia el siguiente nivel: ${percent}%`}
      >
        <div
          className={`h-full rounded-full bg-gradient-to-r ${visual.bar} transition-[width] duration-700 ease-out motion-reduce:transition-none`}
          style={{ width: `${isMax ? 100 : percent}%` }}
        />
      </div>
    </div>
  );
}
