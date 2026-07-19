"use client";

import { useEffect, useState } from "react";
import { CloudUpload, RefreshCw } from "lucide-react";
import { subscribeOfflineQueue } from "@/lib/offline/syncQueue";
import { useServerOnline } from "@/context/ServerStatusContext";

// Indicador de cambios pendientes de sincronizar (Fase 2). Aparece cuando hay
// mutaciones en cola: mientras el servidor está caído las acumula ("se guardarán al
// reconectar") y, al volver el servidor, muestra que se están sincronizando hasta
// vaciarse.
export default function OfflineQueueBadge() {
  const [pending, setPending] = useState(0);
  const online = useServerOnline();

  useEffect(() => subscribeOfflineQueue(setPending), []);

  if (pending <= 0) return null;

  const plural = pending === 1 ? "" : "s";
  const label = online
    ? `Sincronizando ${pending} cambio${plural}…`
    : `${pending} cambio${plural} se guardará${plural ? "n" : ""} al reconectar`;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-[calc(9rem+env(safe-area-inset-bottom))] left-1/2 z-[199] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-white/15 bg-black/85 px-3.5 py-1.5 text-xs font-medium text-white shadow-[0_10px_30px_-10px_rgba(0,0,0,0.7)] backdrop-blur lg:bottom-[4.5rem]"
    >
      {online ? (
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <CloudUpload className="h-3.5 w-3.5 text-amber-400" />
      )}
      {label}
    </div>
  );
}
