"use client";

import { WifiOff } from "lucide-react";
import { useServerOnline } from "@/context/ServerStatusContext";

// Píldora no intrusiva, visible solo cuando el servidor propio (NAS) está caído.
// - `floating` (escritorio): flotante abajo al centro.
// - `below-nav` (móvil/tablet): se monta DENTRO del <nav> sticky y se ancla con
//   `top-full`, así queda justo debajo de la barra superior aunque esta cambie
//   de alto con el scroll (h-16 → h-12/h-14).
const PLACEMENT_CLASS = {
  floating: "hidden desktop:flex fixed bottom-4 z-[200]",
  "below-nav": "desktop:hidden flex absolute top-full mt-2",
};

export default function OfflineBanner({ placement = "floating" }) {
  const online = useServerOnline();
  if (online) return null;

  // En móvil el texto completo se partía en varias líneas y tapaba contenido:
  // allí se reduce a una píldora de una línea; el texto largo queda para
  // pantallas anchas y para lectores de pantalla.
  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none left-1/2 -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-300/40 bg-amber-500/90 px-2.5 py-1 text-[11px] font-semibold leading-none text-black shadow-[0_8px_20px_-10px_rgba(0,0,0,0.7)] backdrop-blur sm:gap-2 sm:px-4 sm:py-2 sm:text-xs ${PLACEMENT_CLASS[placement]}`}
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
      <span className="sm:hidden" aria-hidden="true">Sin conexión · solo lectura</span>
      <span className="sr-only sm:not-sr-only">Solo lectura · servidor no disponible · última copia guardada</span>
    </div>
  );
}
