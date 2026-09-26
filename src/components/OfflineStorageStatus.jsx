"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, CloudOff, Loader2, RotateCcw } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useServerOnline } from "@/context/ServerStatusContext";
import { PREPARATION_EVENT } from "@/lib/offline/client";

// `long` para pantallas anchas, `short` para que la fila de móvil no se corte.
const STATUS_TEXT = {
  idle: {
    long: "Tus páginas y fichas visitadas se guardan para consultarlas sin servidor",
    short: "Consulta tus páginas sin servidor",
  },
  ready: { long: "Copia guardada en este dispositivo", short: "Copia guardada" },
  preparing: { long: "Preparando la copia de tus páginas…", short: "Preparando…" },
  "storage-full": { long: "No hay espacio suficiente en el dispositivo", short: "Sin espacio" },
  partial: { long: "Copia parcial: algunos datos no estaban disponibles", short: "Copia parcial" },
};

// Fila de Ajustes con el mismo lenguaje que SettingActionRow (panel de cristal,
// icono, título, descripción y acción a la derecha). `panelClassName` recibe la
// superficie de cristal de la página para no duplicar su definición.
export default function OfflineStorageStatus({ panelClassName = "" }) {
  const { user } = useAuth();
  const online = useServerOnline();
  const [state, setState] = useState(null);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`showverse:offline:prepared:${user?.id}`) || "null");
      if (saved) setState({ ...saved, phase: saved.failures?.length ? "partial" : "ready" });
    } catch { /* storage unavailable */ }
    const update = (event) => setState(event.detail);
    window.addEventListener(PREPARATION_EVENT, update);
    return () => window.removeEventListener(PREPARATION_EVENT, update);
  }, [user?.id]);

  const phase = state?.phase;
  const preparing = phase === "preparing";
  const warning = phase === "partial" || phase === "storage-full";
  const status = STATUS_TEXT[phase] || STATUS_TEXT.idle;
  const updatedAt = state?.updatedAt && !warning && !preparing
    ? new Date(state.updatedAt).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : null;
  const detail = preparing
    ? { long: `${state.completed} pasos completados`, short: `${state.completed}` }
    : updatedAt
      ? { long: `última el ${updatedAt}`, short: updatedAt }
      : null;
  const Icon = preparing ? Loader2 : warning ? AlertTriangle : CloudOff;

  return (
    <section
      aria-labelledby="offline-storage-title"
      // Misma disposición que SettingActionRow en todos los anchos: acción a la
      // derecha y una sola línea de descripción.
      title="Sin servidor podrás consultar tus páginas y las fichas visitadas, pero no hacer cambios."
      className={`${panelClassName} rounded-2xl p-4 sm:p-5 flex items-center justify-between gap-4 group`}
    >
      <div className="flex min-w-0 items-center gap-4">
        <div
          className={`h-10 w-10 shrink-0 rounded-xl bg-white/5 p-2.5 group-hover:scale-105 group-hover:bg-white/10 transition-all duration-300 flex items-center justify-center ${
            warning ? "text-amber-400" : "text-emerald-400"
          }`}
        >
          <Icon className={`h-5 w-5 shrink-0 ${preparing ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 id="offline-storage-title" className="text-sm font-bold text-white tracking-wide">
            Consulta sin conexión
          </h3>
          <p className="mt-1 text-xs sm:text-sm text-zinc-400 leading-relaxed truncate max-w-md sm:max-w-xl" role="status">
            <span className="sm:hidden">
              {status.short}
              {detail ? ` · ${detail.short}` : null}
            </span>
            <span className="hidden sm:inline">
              {status.long}
              {detail ? ` · ${detail.long}` : null}
            </span>
          </p>
        </div>
      </div>
      <button
        type="button"
        disabled={!online || preparing}
        onClick={() => window.dispatchEvent(new Event("showverse:offline-prepare"))}
        aria-label="Actualizar copia sin conexión"
        className="min-h-9 px-4 shrink-0 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-xs sm:text-sm font-bold text-emerald-300 transition-all duration-200 flex items-center justify-center gap-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
      >
        <RotateCcw className="h-3.5 w-3.5 max-sm:hidden" aria-hidden="true" />
        <span>Actualizar</span>
      </button>
    </section>
  );
}
