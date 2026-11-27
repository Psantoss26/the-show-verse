"use client";

// Progreso de un cálculo por lotes: anillo que se llena y «hechos/total».
// Es el mismo indicador del botón de calcular una media en la cabecera de las
// agrupaciones (GroupScoreStats) y el del menú «Agrupar» de Favoritos y
// Pendientes mientras llegan los datos de la agrupación elegida (plataformas,
// notas de IMDb o de Trakt).

// Anillo de progreso: `value` de 0 a 1 (con un mínimo visible).
export function ProgressRing({ value, className = "h-full w-full" }) {
  const r = 8;
  const c = 2 * Math.PI * r;
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className={`-rotate-90 ${className}`}>
      <circle cx="10" cy="10" r={r} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
      <circle
        cx="10"
        cy="10"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(1, Math.max(0.06, value)))}
        className="transition-[stroke-dashoffset] duration-300 ease-out"
      />
    </svg>
  );
}

// Suma varios progresos ({ done, total } o null); null si no queda ninguno.
export function sumProgress(list) {
  let done = 0;
  let total = 0;
  for (const p of list) {
    if (!p || !(p.total > 0)) continue;
    done += Math.min(p.done, p.total);
    total += p.total;
  }
  return total > 0 ? { done, total } : null;
}

// «12/80» y el anillo. `ringClassName` fija el tamaño del anillo.
export default function GroupingProgress({
  progress,
  label = "Agrupando",
  className = "",
  textClassName = "text-xs text-zinc-300",
  ringClassName = "h-4 w-4",
}) {
  if (!progress || !(progress.total > 0)) return null;
  const done = Math.min(progress.done, progress.total);
  return (
    <span
      role="status"
      aria-label={`${label}: ${done} de ${progress.total}`}
      title={`${label}: ${done} de ${progress.total}`}
      className={`inline-flex shrink-0 items-center gap-1.5 ${className}`}
    >
      <span aria-hidden="true" className={`font-bold leading-none tabular-nums ${textClassName}`}>
        {done}/{progress.total}
      </span>
      <span aria-hidden="true" className={`grid shrink-0 place-items-center ${ringClassName}`}>
        <ProgressRing value={done / progress.total} />
      </span>
    </span>
  );
}
