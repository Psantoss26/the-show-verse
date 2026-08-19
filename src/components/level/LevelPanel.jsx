"use client";

// src/components/level/LevelPanel.jsx
// Contenido de la pestaña Nivel: la insignia, el progreso, de dónde sale el XP y
// los logros. Recibe el resumen que ya trae el perfil para pintar la cabecera en
// el primer frame, y pide el detalle (desglose y logros) a la API.

import { useEffect, useState } from "react";
import { Flame, Info } from "lucide-react";

import LevelBadge from "./LevelBadge";
import LevelProgress from "./LevelProgress";
import XpBreakdown from "./XpBreakdown";
import AchievementGrid from "./AchievementGrid";
import { formatXp, LEVEL_TIER_VISUALS, tierVisual } from "@/lib/level/tiers.mjs";

function StatCell({ value, label, delay = 0 }) {
  return (
    <div
      className="sv-level-rise rounded-2xl bg-gradient-to-br from-white/[0.08] to-white/[0.03] px-4 py-3 text-center"
      style={{ "--sv-level-delay": `${delay}ms` }}
    >
      <span className="block text-xl font-black tracking-tight text-white sm:text-2xl">{value}</span>
      <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-widest text-zinc-400 sm:text-[10px]">
        {label}
      </span>
    </div>
  );
}

export default function LevelPanel({ username, initialSummary = null }) {
  const [level, setLevel] = useState(null);
  const [status, setStatus] = useState("loading");
  const [legendOpen, setLegendOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");

    (async () => {
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(username)}/level`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setLevel(data);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [username]);

  // Mientras llega el detalle se pinta la cabecera con el resumen del perfil: la
  // insignia no debe aparecer de golpe al terminar la petición.
  const shown = level || initialSummary;
  const visual = tierVisual(shown?.tier);

  // Sin estado de carga: se reserva el hueco para que la entrada del panel no
  // desplace lo que hay debajo, pero sin latido ni indicador. El contenido
  // aparece animado en cuanto está.
  if (!shown && status === "loading") {
    return <div className="mt-8 h-64" aria-busy="true" />;
  }

  if (!shown) {
    return (
      <section className="mt-8 flex min-h-72 flex-col items-center justify-center rounded-[2rem] border border-dashed border-white/[0.08] bg-white/[0.02] px-6 text-center">
        <h2 className="text-lg font-black text-white">No se pudo cargar el nivel</h2>
        <p className="mt-1 max-w-sm text-sm text-zinc-500">
          Vuelve a intentarlo en unos segundos.
        </p>
      </section>
    );
  }

  const progress = shown.progress || {
    percent: shown.percent,
    xpToNextLevel: shown.xpToNextLevel,
    isMax: shown.isMax,
  };
  const streaks = level?.streaks;
  const tierLegend = Object.values(LEVEL_TIER_VISUALS);
  const showLegend = () => setLegendOpen(true);
  const hideLegend = () => setLegendOpen(false);

  return (
    <div className="mt-8 space-y-8">
      {/* ── Cabecera: la insignia manda ── */}
      {/* El recuadro entra como una pieza y, dentro, la insignia, el rótulo, la
          barra y las cifras se escalonan detrás. Los retardos son relativos a
          este bloque, que se pinta en el primer frame con el resumen que ya
          traía el perfil. */}
      <section className="sv-level-rise overflow-visible rounded-[2rem] bg-gradient-to-br from-white/[0.09] to-white/[0.03] p-5 sm:p-7">
        {/* items-stretch: la insignia `fill` toma el alto de esta fila, que lo
            marca la columna de información de su derecha. */}
        <div className="flex flex-wrap items-stretch gap-5">
          <div className="sv-level-rise flex" style={{ "--sv-level-delay": "90ms" }}>
            <LevelBadge level={shown.level} tier={shown.tier} size="fill" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <p
                className="sv-level-rise pt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500"
                style={{ "--sv-level-delay": "130ms" }}
              >
                Nivel {shown.level} de {progress?.maxLevel || 40}
              </p>
              <div
                className="relative shrink-0"
                onMouseEnter={showLegend}
                onMouseLeave={hideLegend}
                onFocus={showLegend}
                onBlur={hideLegend}
              >
                <button
                  type="button"
                  onClick={() => setLegendOpen((open) => !open)}
                  aria-expanded={legendOpen}
                  aria-controls="level-tier-legend"
                  aria-label={legendOpen ? "Ocultar leyenda de rangos" : "Mostrar leyenda de rangos"}
                  title={legendOpen ? "Ocultar leyenda" : "Ver leyenda de rangos"}
                  className={`sv-level-rise inline-flex h-9 w-9 items-center justify-center rounded-full transition-all duration-250 focus:outline-none ${
                    legendOpen
                      ? "scale-105 bg-gradient-to-br from-white/10 to-white/5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_0_12px_rgba(255,255,255,0.08)] backdrop-blur-md"
                      : "bg-transparent text-zinc-400 hover:scale-105 hover:bg-gradient-to-br hover:from-white/8 hover:to-white/2 hover:text-white"
                  }`}
                  style={{ "--sv-level-delay": "145ms" }}
                >
                  <Info className="h-4.5 w-4.5" aria-hidden="true" />
                </button>

                {legendOpen && (
                  <div
                    id="level-tier-legend"
                    className="absolute right-0 top-full z-30 mt-2 w-[min(78vw,260px)] rounded-xl bg-[#111214]/95 p-3 shadow-2xl backdrop-blur-xl sm:w-[300px]"
                  >
                    <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-400">
                      Leyenda
                    </div>
                    <ol className="grid grid-cols-1 gap-2" aria-label="Rangos de nivel disponibles">
                      {tierLegend.map((tier) => (
                        <li
                          key={tier.name}
                          className="inline-flex items-center gap-2 whitespace-nowrap text-[12px] font-medium text-zinc-100"
                        >
                          <span
                            className="inline-block h-3.5 w-3.5 shrink-0 rounded-full"
                            style={{ backgroundColor: tier.hex }}
                            aria-hidden="true"
                          />
                          {tier.name} · nivel {tier.minLevel}–{tier.maxLevel}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            </div>
            <h2
              className={`sv-level-rise mt-0.5 text-[clamp(1.6rem,5vw,2.5rem)] font-black leading-none tracking-[-0.04em] ${visual.accent}`}
              style={{ "--sv-level-delay": "160ms" }}
            >
              {visual.name}
            </h2>
            <LevelProgress
              className="sv-level-rise mt-3 max-w-md"
              style={{ "--sv-level-delay": "200ms" }}
              barDelay={320}
              level={shown.level}
              tier={shown.tier}
              progress={progress}
              xp={shown.xp}
            />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <StatCell value={formatXp(shown.xp)} label="Experiencia" delay={260} />
          <StatCell
            value={`${level?.achievements?.unlockedCount ?? shown.achievementsUnlocked ?? 0}/${level?.achievements?.total ?? shown.achievementsTotal ?? 0}`}
            label="Logros"
            delay={305}
          />
          <StatCell value={streaks?.longest ?? "—"} label="Mejor racha" delay={350} />
          <StatCell value={streaks?.activeDays ?? "—"} label="Días activos" delay={395} />
        </div>

        {streaks?.current > 0 && (
          <p
            className="sv-level-rise mt-3 inline-flex items-center gap-1.5 rounded-full bg-orange-400/10 px-3 py-1 text-xs font-bold text-orange-300"
            style={{ "--sv-level-delay": "450ms" }}
          >
            <Flame className="h-3.5 w-3.5" aria-hidden="true" />
            {streaks.current} {streaks.current === 1 ? "día seguido" : "días seguidos"} con actividad
          </p>
        )}
      </section>

      {/* ── De dónde sale el XP ── */}
      <section>
        <div
          className="sv-level-rise mb-3 flex items-center justify-between border-b border-white/10 pb-2"
          style={{ "--sv-level-delay": "180ms" }}
        >
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">
            De dónde sale la experiencia
          </h2>
        </div>
        {status === "loading" && !level ? (
          <div className="h-48" aria-busy="true" />
        ) : (
          <XpBreakdown breakdown={level?.breakdown} tier={shown.tier} total={shown.xp} />
        )}
      </section>

      {/* ── Logros ── */}
      {level?.achievements?.items?.length ? (
        <section>
          <div className="sv-level-rise mb-4 flex items-center justify-between border-b border-white/10 pb-2">
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Logros</h2>
            <span className="text-[10px] font-bold uppercase tracking-widest tabular-nums text-zinc-500">
              {level.achievements.unlockedCount} de {level.achievements.total}
            </span>
          </div>
          <AchievementGrid achievements={level.achievements} />
        </section>
      ) : null}

    </div>
  );
}
