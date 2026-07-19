"use client";

import { WifiOff } from "lucide-react";
import { useServerOnline } from "@/context/ServerStatusContext";

// Píldora flotante, no intrusiva, visible solo cuando el servidor propio (NAS) está
// caído. Colocada por encima de la barra inferior móvil.
export default function OfflineBanner() {
  const online = useServerOnline();
  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-[200] flex -translate-x-1/2 items-center gap-2 rounded-full border border-amber-300/40 bg-amber-500/95 px-4 py-2 text-xs font-semibold text-black shadow-[0_10px_30px_-10px_rgba(0,0,0,0.7)] backdrop-blur lg:bottom-4"
    >
      <WifiOff className="h-4 w-4" />
      Sin conexión con el servidor · mostrando lo último guardado
    </div>
  );
}
