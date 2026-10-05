"use client";

// Detecciones recientes de la EXTENSIÓN del navegador (últimos 7 días). Sirve
// para corregir una detección cuyo indicador ya no está: desaparece al cambiar
// de página. Las del móvil no salen aquí: tienen su registro en la app de
// Android (The Show Verse Sync o la app completa), que el backend filtra.

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ChevronRight, Film, Loader2, Radar, Tv } from "lucide-react";

import OptimizedImage from "@/components/OptimizedImage";
import { useAuth } from "@/context/AuthContext";
import { detectionPlatformLabel, fetchRecentDetections } from "@/lib/api/detectionsClient";
import { LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400";
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

function StatusBadge({ detection }) {
  if (detection.status !== "corrected") return null;
  const label = detection.correction?.verdict === "not_a_title"
    ? "Descartada"
    : detection.correction?.tmdbId
      ? `Corregida: ${detection.correction.title || "otro título"}`
      : "Título descartado";
  return (
    <span className="mt-1 inline-flex max-w-full items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
      <span className="truncate">{label}</span>
    </span>
  );
}

function DetectionRow({ detection }) {
  const isTv = detection.mediaType === "tv";
  const poster = detection.posterPath ? `https://image.tmdb.org/t/p/w154${detection.posterPath}` : null;
  const ep = detection.season && detection.episode ? `T${detection.season} · E${detection.episode}` : null;
  return (
    <li>
      <Link
        href={`/detections/${detection.id}`}
        className={`flex items-center gap-3 rounded-2xl bg-white/[0.04] p-2.5 transition hover:bg-white/[0.08] ${FOCUS_RING}`}
      >
        <div className="h-16 w-11 shrink-0 overflow-hidden rounded-lg bg-zinc-900">
          {poster ? (
            <OptimizedImage src={poster} alt="" width={88} height={128} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-zinc-600">
              {isTv ? <Tv className="h-5 w-5" aria-hidden="true" /> : <Film className="h-5 w-5" aria-hidden="true" />}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-sm font-bold text-white">{detection.title || "Sin título"}</p>
          <p className="mt-0.5 line-clamp-1 text-xs text-zinc-400">
            {detection.kind === "detail" ? "Ficha" : "Reproducción"} · {detectionPlatformLabel(detection)}
            {ep ? ` · ${ep}` : ""}
          </p>
          <p className="text-xs text-zinc-500">
            <time dateTime={detection.createdAt}>{relativeTime(detection.createdAt)}</time>
          </p>
          <StatusBadge detection={detection} />
        </div>
        <span className="flex shrink-0 items-center gap-0.5 text-xs font-bold text-zinc-400">
          <span className="hidden sm:inline">{detection.status === "corrected" ? "Cambiar" : "Corregir"}</span>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </Link>
    </li>
  );
}

export default function DetectionsClient() {
  const { authenticated, hydrated } = useAuth();
  const [detections, setDetections] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hydrated || !authenticated) return undefined;
    const controller = new AbortController();
    fetchRecentDetections({ days: 7, signal: controller.signal })
      .then(setDetections)
      .catch((fetchError) => {
        if (fetchError?.name !== "AbortError") {
          setError(
            fetchError?.status === 401
              ? "Tu sesión ha caducado. Vuelve a iniciar sesión para ver tus detecciones."
              : fetchError?.message || "No se pudieron cargar las detecciones",
          );
        }
      });
    return () => controller.abort();
  }, [hydrated, authenticated]);

  let body;
  if (hydrated && !authenticated) {
    body = (
      <div className="space-y-4 text-center">
        <p className="text-sm text-zinc-300">Inicia sesión para ver tus detecciones.</p>
        <Link
          href="/login?next=/detections"
          className={`inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-500/15 px-5 text-sm font-bold text-emerald-300 transition hover:bg-emerald-500/25 ${FOCUS_RING}`}
        >
          Iniciar sesión
        </Link>
      </div>
    );
  } else if (error) {
    body = (
      <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {error}
      </p>
    );
  } else if (!detections) {
    body = (
      <div className="flex min-h-40 items-center justify-center" role="status" aria-label="Cargando">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400 motion-reduce:animate-none" aria-hidden="true" />
      </div>
    );
  } else if (detections.length === 0) {
    body = (
      <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 px-6 text-center">
        <Radar className="mb-3 h-8 w-8 text-zinc-600" aria-hidden="true" />
        <p className="text-sm font-bold text-zinc-300">Sin detecciones en los últimos 7 días</p>
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-zinc-500">
          Aparecerán aquí los títulos que detecte la extensión del navegador. Los del móvil, en la app The Show Verse Sync.
        </p>
      </div>
    );
  } else {
    body = (
      <ul className="grid gap-2" aria-label="Detecciones de los últimos 7 días">
        {detections.map((detection) => (
          <DetectionRow key={detection.id} detection={detection} />
        ))}
      </ul>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-28 pt-6 sm:pt-10">
      <section className={`${LIQUID_GLASS_PANEL} rounded-[2rem] p-5 sm:p-7`} aria-labelledby="detections-title">
        <h1 id="detections-title" className="text-xl font-bold text-white">
          Detecciones del navegador
        </h1>
        <p className="mb-5 mt-1 text-sm leading-relaxed text-zinc-400">
          Lo que ha detectado la extensión del navegador en los últimos 7 días. Si alguna no era
          correcta, corrígela: se arregla lo guardado y la sincronización aprende de ello. Las
          detecciones del móvil se revisan en la app The Show Verse Sync.
        </p>
        {body}
      </section>
    </main>
  );
}
