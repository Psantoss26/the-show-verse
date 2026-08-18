// src/components/level/XpBreakdown.jsx
// De dónde sale cada punto de experiencia.
//
// La barra de cada fila es proporcional a la fuente que más aporta, no al total:
// así se lee de un golpe qué actividad sostiene el nivel. Se muestra la
// aritmética completa (recuento × peso) porque un sistema de puntos que no se
// puede comprobar se percibe como arbitrario.

import { formatXp, tierVisual } from "@/lib/level/tiers.mjs";

export default function XpBreakdown({ breakdown, tier, total }) {
  const rows = Array.isArray(breakdown) ? breakdown : [];
  const visual = tierVisual(tier);

  if (!rows.length) {
    return (
      <p className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] px-5 py-8 text-center text-sm text-zinc-500">
        Marca una película como vista, puntúa un título o escribe una reseña y la
        experiencia empezará a contar aquí.
      </p>
    );
  }

  const max = Math.max(...rows.map((row) => row.xp));

  // Escalonado de las filas. El paso se topa a 12 filas para que un desglose
  // largo no acabe con la última barra llenándose varios segundos tarde: a
  // partir de ahí entran a la vez y la cascada sigue leyéndose igual.
  const rowDelay = (index) => 60 + Math.min(index, 12) * 55;

  return (
    <div>
      <ul className="space-y-2.5">
        {rows.map((row, index) => (
          <li
            key={row.key}
            className="sv-level-rise"
            style={{ "--sv-level-delay": `${rowDelay(index)}ms` }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm font-bold text-zinc-200">{row.label}</span>
              <span className="shrink-0 text-xs font-bold tabular-nums text-zinc-500">
                <span className="text-zinc-400">{formatXp(row.count)}</span>
                <span className="mx-1 text-zinc-600">×</span>
                {row.weight}
                <span className="mx-1 text-zinc-600">=</span>
                <span className={`font-black ${visual.accent}`}>{formatXp(row.xp)}</span>
              </span>
            </div>
            {/* La barra arranca su llenado cuando su fila ya está colocada, no
                a la vez: primero se lee la cifra y después crece la barra. */}
            <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-white/[0.05]">
              <div
                className={`sv-level-bar h-full rounded-full bg-gradient-to-r ${visual.bar} opacity-80`}
                style={{
                  // Ancho en línea además de en la custom property: sin la hoja
                  // cargada, un div de bloque sin `width` ocuparía el 100% y
                  // todas las filas parecerían iguales. Ver `.sv-level-bar`.
                  width: `${Math.max(2, Math.round((row.xp / max) * 100))}%`,
                  "--sv-level-bar-width": `${Math.max(2, Math.round((row.xp / max) * 100))}%`,
                  "--sv-level-delay": `${rowDelay(index) + 110}ms`,
                }}
              />
            </div>
          </li>
        ))}
      </ul>

      <div
        className="sv-level-rise mt-4 flex items-baseline justify-between border-t border-white/10 pt-3"
        style={{ "--sv-level-delay": `${rowDelay(rows.length) + 60}ms` }}
      >
        <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">
          Experiencia total
        </span>
        <span className="text-lg font-black tracking-tight text-white">
          {formatXp(total)} <span className="text-xs font-bold text-zinc-500">XP</span>
        </span>
      </div>
    </div>
  );
}
