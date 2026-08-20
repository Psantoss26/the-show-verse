"use client";

import { useEffect, useState } from "react";

// Altura a la que se pega el MENÚ DE SECCIONES de una ficha: justo debajo del
// navbar superior, sin hueco.
//
// Los dos valores viven aquí, y no en cada ficha, porque ya se separaron una vez:
// `DetailsClient` bajaba a 48 en móvil y `ActorDetails` se había quedado con 72
// fijo, así que en el perfil de un actor el menú flotaba 24px por debajo del
// navbar —medido: el navbar compacto de móvil mide 48px exactos— mientras que en
// la ficha de una película quedaba pegado. Un solo sitio, y no pueden divergir.
export const DETAILS_STICKY_TOP_MOBILE = 48;
export const DETAILS_STICKY_TOP_DESKTOP = 72;

// Mismo punto de corte que el resto de la ficha (`sm` de Tailwind).
const MOBILE_QUERY = "(max-width: 640px)";

/**
 * Devuelve el `top` en píxeles al que debe pegarse el menú de secciones.
 *
 * Arranca en el valor de escritorio para que el HTML del servidor y el primer
 * render del cliente coincidan; el efecto lo corrige enseguida. No hay salto
 * visible porque el menú vive muy por debajo del pliegue: para cuando el usuario
 * llega a él desplazándose, el valor lleva mucho resuelto.
 */
export default function useDetailsStickyTop() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;

    const query = window.matchMedia(MOBILE_QUERY);
    const apply = () => setIsMobile(!!query.matches);
    apply();

    if (query.addEventListener) {
      query.addEventListener("change", apply);
      return () => query.removeEventListener("change", apply);
    }
    // Safari antiguo.
    query.addListener(apply);
    return () => query.removeListener(apply);
  }, []);

  return isMobile ? DETAILS_STICKY_TOP_MOBILE : DETAILS_STICKY_TOP_DESKTOP;
}
