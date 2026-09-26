"use client";

import { WifiOff } from "lucide-react";
import { useServerOnline } from "@/context/ServerStatusContext";

// Píldora flotante, no intrusiva, visible solo cuando el servidor propio (NAS) está
// caído. Colocada por encima de la barra inferior móvil.
export default function OfflineBanner() {
  const online = useServerOnline();
  if (online) return null;

  // En móvil el texto completo se partía en varias líneas y tapaba contenido:
  // allí se reduce a una píldora de una línea; el texto largo queda para
  // pantallas anchas y para lectores de pantalla.
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] left-1/2 z-[200] flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-300/40 bg-amber-500/90 px-2.5 py-1 text-[11px] font-semibold leading-none text-black shadow-[0_8px_20px_-10px_rgba(0,0,0,0.7)] backdrop-blur sm:gap-2 sm:px-4 sm:py-2 sm:text-xs lg:bottom-4"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
      <span className="sm:hidden" aria-hidden="true">Sin conexión · solo lectura</span>
      <span className="sr-only sm:not-sr-only">Solo lectura · servidor no disponible · última copia guardada</span>
    </div>
  );
}
