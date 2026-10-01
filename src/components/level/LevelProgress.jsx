// src/components/level/LevelProgress.jsx
// Barra de experiencia hacia el siguiente nivel.

import { formatXp, tierVisual } from "@/lib/level/tiers.mjs";

export default function LevelProgress({
  level,
  tier,
  progress,
  xp,
  className = "",
  style,
  // Retardo del llenado de la barra. Quien la coloca sabe cuándo ha terminado
  // de entrar el bloque que la contiene; por defecto, cero (la barra del panel
  // lateral del perfil no escalona con nada).
  barDelay = 0,
  // Sin la fila de textos (XP y XP restante): para quien ya los pinta en otro
  // sitio, como el lateral compacto del perfil.
  showLabels = true,
  barClassName = "h-2",
}) {
  const visual = tierVisual(tier);
  const percent = Math.max(0, Math.min(100, Number(progress?.percent) || 0));
  const isMax = Boolean(progress?.isMax);
  const totalXp = Number.isFinite(Number(xp)) ? Number(xp) : Number(progress?.xp) || 0;

  return (
    <div className={className} style={style}>
      {showLabels ? (
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
      ) : null}

      <div
        className={`${showLabels ? "mt-2" : ""} ${barClassName} overflow-hidden rounded-full bg-white/[0.07]`}
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progreso hacia el siguiente nivel: ${percent}%`}
      >
        {/* `sv-level-bar` la llena desde cero al montar; el `transition-[width]`
            sigue cubriendo el caso posterior: cuando llega el detalle de la API
            el porcentaje puede afinarse y ahí ya no queremos otro llenado, sino
            un ajuste. Convive con la animación porque esta usa `backwards`. */}
        <div
          className={`sv-level-bar h-full rounded-full bg-gradient-to-r ${visual.bar} transition-[width] duration-700 ease-out motion-reduce:transition-none`}
          style={{
            // El ancho va TAMBIÉN en línea, no solo en la custom property: si la
            // hoja no llegara, un div de bloque sin `width` ocuparía el 100% y
            // toda barra mentiría. La animación gana igualmente mientras corre
            // (una animación pisa el estilo en línea), así que el llenado desde
            // cero se mantiene.
            width: `${isMax ? 100 : percent}%`,
            "--sv-level-bar-width": `${isMax ? 100 : percent}%`,
            "--sv-level-delay": `${barDelay}ms`,
          }}
        />
      </div>
    </div>
  );
}
