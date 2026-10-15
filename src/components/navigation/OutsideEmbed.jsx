"use client";

import { usePathname } from "next/navigation";
import { EMBEDDED_DETAILS_PREFIX } from "@/lib/navigation/embeddedDetails";

// Lo que solo tiene sentido en la APP, no en la ficha que el panel de
// temporada/episodio pinta en un iframe (`/embed/details/...`): PWA,
// notificaciones, copia offline, sincronizaciones y analítica. Dentro del
// panel se montaban en CADA apertura, compitiendo con la ficha por la red y el
// hilo principal mientras cargaba, y la analítica contaba cada panel como una
// visita. La app que lo contiene ya los tiene.
export default function OutsideEmbed({ children }) {
  const pathname = usePathname();
  if (pathname?.startsWith(EMBEDDED_DETAILS_PREFIX)) return null;
  return children;
}
