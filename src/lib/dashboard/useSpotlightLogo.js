"use client";

import { useEffect, useState } from "react";
import { fetchBestLogo, peekBestLogo } from "@/lib/dashboard/media";

const LOGO_LANGS = ["en", "es", null];

/**
 * Logo de la vista previa destacada (spotlight) del dashboard: Más esperadas en
 * Inicio y Tendencias en Películas y Series.
 *
 * Tres estados, para que el TÍTULO EN TEXTO no aparezca antes que el logo:
 *  - `undefined`: aún se está resolviendo → no se pinta ni logo ni título
 *    (solo se reserva su hueco);
 *  - `null`: el título no tiene logo → se pinta el título;
 *  - ruta: se pinta el logo.
 * Antes el estado arrancaba en `null` en cada apertura, que significa "sin
 * logo": en el primer hover se veía el título mientras llegaba la petición, y
 * después lo sustituía el logo. Con la caché ya llena (siguientes hovers) se
 * arranca directamente en el estado final.
 */
export default function useSpotlightLogo(itemId, mediaType, enabled = true) {
  const type = mediaType === "tv" ? "tv" : "movie";
  const [state, setState] = useState(() =>
    enabled && itemId ? peekBestLogo(itemId, type, LOGO_LANGS) : null,
  );

  useEffect(() => {
    if (!enabled || !itemId) {
      setState(null);
      return undefined;
    }
    const cached = peekBestLogo(itemId, type, LOGO_LANGS);
    setState(cached);
    if (cached !== undefined) return undefined;
    let cancelled = false;
    fetchBestLogo(itemId, type, LOGO_LANGS)
      .then((path) => {
        if (!cancelled) setState(path || null);
      })
      .catch(() => {
        if (!cancelled) setState(null);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, itemId, type]);

  return state;
}
