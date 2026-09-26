"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, CloudOff, Loader2, RotateCcw } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useServerOnline } from "@/context/ServerStatusContext";
import { PREPARATION_EVENT } from "@/lib/offline/client";

const STATUS_TEXT = {
  ready: "Copia de tus páginas preparada",
  preparing: "Preparando la copia…",
  "storage-full": "No hay espacio suficiente en el dispositivo",
  partial: "Copia parcial: faltaron algunos datos",
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
  const status = STATUS_TEXT[phase] || "Se prepara automáticamente mientras el servidor está disponible";
  const detail = preparing
    ? `${state.completed} pasos completados`
    : state?.updatedAt && !warning
      ? `Última copia: ${new Date(state.updatedAt).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" })}`
      : null;
  const Icon = preparing ? Loader2 : warning ? AlertTriangle : CloudOff;

  return (
    <section
      aria-labelledby="offline-storage-title"
      className={`${panelClassName} rounded-2xl p-4 sm:p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between group`}
    >
      <div className="flex min-w-0 items-start gap-4">
        <div
          className={`h-10 w-10 shrink-0 rounded-xl bg-white/5 p-2.5 ring-1 ring-white/10 group-hover:scale-105 group-hover:bg-white/10 transition-all duration-300 flex items-center justify-center ${
            warning ? "text-amber-400" : "text-emerald-400"
          }`}
        >
          <Icon className={`h-5 w-5 shrink-0 ${preparing ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 id="offline-storage-title" className="text-sm font-bold text-white tracking-wide">
            Consulta sin conexión
          </h3>
          <p className="mt-1 text-xs sm:text-sm text-zinc-300" role="status">
            {status}
            {detail ? <span className="text-zinc-500"> · {detail}</span> : null}
          </p>
          <p className="mt-1 text-xs text-zinc-500 leading-relaxed">
            Tus páginas y las fichas visitadas se guardan en este navegador. Sin servidor podrás consultarlas, pero no hacer cambios.
          </p>
        </div>
      </div>
      <button
        type="button"
        disabled={!online || preparing}
        onClick={() => window.dispatchEvent(new Event("showverse:offline-prepare"))}
        className="min-h-9 px-4 shrink-0 self-start sm:self-auto rounded-xl border border-emerald-500/20 bg-emerald-500/10 hover:bg-emerald-500/20 text-xs sm:text-sm font-bold text-emerald-300 transition-all duration-200 flex items-center justify-center gap-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Actualizar copia</span>
      </button>
    </section>
  );
}
