"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useServerOnline } from "@/context/ServerStatusContext";
import { PREPARATION_EVENT } from "@/lib/offline/client";

export default function OfflineStorageStatus() {
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
  const text = state?.phase === "ready" ? "Copia de tus páginas de usuario preparada."
    : state?.phase === "preparing" ? `Preparando la copia · ${state.completed} pasos completados…`
      : state?.phase === "storage-full" ? "El dispositivo no tiene espacio suficiente para completar la copia."
        : state?.phase === "partial" ? "Copia parcial: algunos datos no estaban disponibles. Puedes reintentar."
          : "La copia se prepara automáticamente mientras el servidor está disponible.";
  return (
    <section aria-label="Disponibilidad sin conexión" className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
      <h2 className="font-semibold text-white">Consulta sin conexión</h2>
      <p className="mt-1 text-zinc-300" role="status">{text}</p>
      {state?.phase === "ready" && state.updatedAt && <p className="mt-1 text-xs text-zinc-400">Última copia: {new Date(state.updatedAt).toLocaleString("es-ES")}</p>}
      <p className="mt-2 text-xs text-zinc-400">Tus páginas y las fichas visitadas se conservan en este navegador. Sin el servidor podrás consultarlas; los cambios quedan deshabilitados.</p>
      <button type="button" disabled={!online || state?.phase === "preparing"} className="mt-3 rounded-lg border border-white/20 px-3 py-2 disabled:opacity-50" onClick={() => window.dispatchEvent(new Event("showverse:offline-prepare"))}>Actualizar copia</button>
    </section>
  );
}
