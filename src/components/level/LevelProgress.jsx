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
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
          {formatXp(totalXp)} XP
        </span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
          {isMax
            ? "Nivel máximo"
            : `${formatXp(progress?.xpToNextLevel)} XP para el nivel ${Number(level) + 1}`}
        </span>
      </div>

      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]"
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
