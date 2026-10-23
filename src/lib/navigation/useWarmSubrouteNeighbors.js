"use client";

import { useEffect } from "react";
import { useRouter } from "@/lib/offline/useOfflineRouter";

// Precarga COMPLETA (datos de la página, no solo hasta el loading) de la
// temporada o episodio anterior y siguiente, cuando la ficha actual ya está
// en reposo. Sin esto, al pulsar la flecha o deslizar había que esperar a que
// el servidor resolviera la ficha nueva (~0,5-1 s) antes de poder cambiar;
// con la precarga, la navegación usa lo que ya está en el navegador.
//
// Son dos páginas por ficha visitada; con ahorro de datos no se hace (las
// flechas siguen precargando al apuntarlas).
const IDLE_TIMEOUT_MS = 1500;

export function prefetchSubrouteFull(router, href) {
  if (href) router.prefetch?.(href, { kind: "full" });
}

export default function useWarmSubrouteNeighbors(previousHref, nextHref) {
  const router = useRouter();
  useEffect(() => {
    if (!previousHref && !nextHref) return undefined;
    if (navigator.connection?.saveData) return undefined;
    const warm = () => {
      // El sentido habitual (siguiente) primero.
      prefetchSubrouteFull(router, nextHref);
      prefetchSubrouteFull(router, previousHref);
    };
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(warm, { timeout: IDLE_TIMEOUT_MS });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(warm, IDLE_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [router, previousHref, nextHref]);
}
