"use client";

// src/components/level/LevelPanel.jsx
// Contenido de la pestaña Nivel: la insignia, el progreso, de dónde sale el XP y
// los logros. Recibe el resumen que ya trae el perfil para pintar la cabecera en
// el primer frame, y pide el detalle (desglose y logros) a la API.

import { useEffect, useState } from "react";
import { Flame } from "lucide-react";

import LevelBadge from "./LevelBadge";
import LevelProgress from "./LevelProgress";
import XpBreakdown from "./XpBreakdown";
import AchievementGrid from "./AchievementGrid";
import { formatXp, tierVisual } from "@/lib/level/tiers.mjs";

function StatCell({ value, label }) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-white/[0.08] to-white/[0.03] px-4 py-3 text-center">
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

  if (!shown && status === "loading") {
    return <div className="mt-8 h-64 animate-pulse rounded-[2rem] bg-white/[0.03]" />;
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

  return (
    <div className="mt-8 space-y-8">
      {/* ── Cabecera: la insignia manda ── */}
      <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-white/[0.09] to-white/[0.03] p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-5">
          <LevelBadge level={shown.level} tier={shown.tier} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
              Nivel {shown.level} de {progress?.maxLevel || 40}
            </p>
            <h2 className={`mt-0.5 text-[clamp(1.6rem,5vw,2.5rem)] font-black leading-none tracking-[-0.04em] ${visual.accent}`}>
              {visual.name}
            </h2>
            <LevelProgress
              className="mt-3 max-w-md"
              level={shown.level}
              tier={shown.tier}
              progress={progress}
              xp={shown.xp}
            />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <StatCell value={formatXp(shown.xp)} label="Experiencia" />
          <StatCell
            value={`${level?.achievements?.unlockedCount ?? shown.achievementsUnlocked ?? 0}/${level?.achievements?.total ?? shown.achievementsTotal ?? 0}`}
            label="Logros"
          />
          <StatCell value={streaks?.longest ?? "—"} label="Mejor racha" />
          <StatCell value={streaks?.activeDays ?? "—"} label="Días activos" />
        </div>

        {streaks?.current > 0 && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-orange-400/10 px-3 py-1 text-xs font-bold text-orange-300">
            <Flame className="h-3.5 w-3.5" aria-hidden="true" />
            {streaks.current} {streaks.current === 1 ? "día seguido" : "días seguidos"} con actividad
          </p>
        )}
      </section>

      {/* ── De dónde sale el XP ── */}
      <section>
        <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">
            De dónde sale la experiencia
          </h2>
        </div>
        {status === "loading" && !level ? (
          <div className="h-48 animate-pulse rounded-2xl bg-white/[0.03]" />
        ) : (
          <XpBreakdown breakdown={level?.breakdown} tier={shown.tier} total={shown.xp} />
        )}
      </section>

      {/* ── Logros ── */}
      {level?.achievements?.items?.length ? (
        <section>
          <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-2">
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
