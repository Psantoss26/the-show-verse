"use client";

// Resumen de los últimos días por plataforma: cuántas observaciones de la
// extensión se reconocieron, cuántas hubo que corregir y cuántas no se pudieron
// reconocer (con su motivo). Es la medición de la que salen las mejoras de cada
// plataforma. Si no carga, no se muestra: la lista de detecciones va aparte.

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

import {
  DISCARD_REASON_LABELS,
  detectionPlatformLabel,
  fetchDetectionStats,
  fetchRecentDiscards,
} from "@/lib/api/detectionsClient";

const RELATIVE = new Intl.RelativeTimeFormat("es", { numeric: "auto" });

function relativeTime(value) {
  const diffMs = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(diffMs)) return "";
  const minutes = Math.round(diffMs / 60_000);
  if (Math.abs(minutes) < 60) return RELATIVE.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return RELATIVE.format(hours, "hour");
  return RELATIVE.format(Math.round(hours / 24), "day");
}

const percent = (rate) => (rate == null ? "—" : `${Math.round(rate * 100)} %`);

function Count({ value, label, tone }) {
  return (
    <div className="min-w-0">
      <dd className={`text-base font-bold tabular-nums ${tone}`}>{value}</dd>
      <dt className="truncate text-[11px] text-zinc-500">{label}</dt>
    </div>
  );
}

function PlatformRow({ entry }) {
  return (
    <li className="rounded-2xl bg-white/[0.04] p-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="truncate text-sm font-bold text-white">{detectionPlatformLabel(entry)}</p>
        <p className="shrink-0 text-xs text-zinc-400">
          Acierto <span className="font-bold tabular-nums text-zinc-200">{percent(entry.successRate)}</span>
        </p>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2">
        <Count value={entry.detected - entry.corrected} label="Reconocidas" tone="text-emerald-300" />
        <Count value={entry.corrected} label="Corregidas" tone="text-amber-300" />
        <Count value={entry.discarded} label="Sin reconocer" tone="text-red-300" />
      </dl>
    </li>
  );
}

function DiscardRow({ discard }) {
  return (
    <li className="rounded-xl bg-white/[0.03] px-3 py-2">
      <p className="line-clamp-1 text-sm font-bold text-zinc-200">{discard.triggerText || "Sin texto"}</p>
      <p className="mt-0.5 line-clamp-2 text-xs text-zinc-400">
        {detectionPlatformLabel(discard)} · {discard.kind === "detail" ? "Ficha" : "Reproducción"} ·{" "}
        {DISCARD_REASON_LABELS[discard.reason] || discard.reason}
        {discard.attempts > 1 ? ` · ${discard.attempts} intentos` : ""}
      </p>
      <p className="text-xs text-zinc-500">
        <time dateTime={discard.lastSeenAt}>{relativeTime(discard.lastSeenAt)}</time>
      </p>
    </li>
  );
}

export default function DetectionSummary({ days = 7 }) {
  const [summary, setSummary] = useState(null);
  const [discards, setDiscards] = useState([]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetchDetectionStats({ days, signal: controller.signal }),
      fetchRecentDiscards({ days, signal: controller.signal }),
    ])
      .then(([stats, recent]) => {
        setSummary(stats);
        setDiscards(recent);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [days]);

  const platforms = Array.isArray(summary?.platforms) ? summary.platforms : [];
  if (!platforms.length) return null;

  return (
    <section className="mb-6" aria-labelledby="detections-summary-title">
      <h2 id="detections-summary-title" className="text-sm font-bold text-zinc-200">
        Resumen por plataforma
      </h2>
      <p className="mb-3 mt-0.5 text-xs leading-relaxed text-zinc-500">
        Últimos {days} días. «Acierto» cuenta lo reconocido sin corregir sobre todo lo observado.
      </p>
      <ul className="grid gap-2 sm:grid-cols-2" aria-label="Resumen por plataforma">
        {platforms.map((entry) => (
          <PlatformRow key={entry.platform} entry={entry} />
        ))}
      </ul>
      {discards.length > 0 && (
        <details className="group mt-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-xl px-1 text-sm font-bold text-zinc-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 [&::-webkit-details-marker]:hidden">
            <ChevronDown className="h-4 w-4 transition group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
            Sin reconocer ({discards.length})
          </summary>
          <ul className="mt-2 grid gap-1.5">
            {discards.map((discard) => (
              <DiscardRow key={discard.id} discard={discard} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
