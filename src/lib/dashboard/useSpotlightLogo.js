"use client";

import { useEffect, useState } from "react";
import { fetchBestLogo, peekBestLogo } from "@/lib/dashboard/media";
import { useCardArtworkState } from "@/lib/hooks/useOwnCardPoster";

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
 *
 * El logo elegido en la ficha o, sin él, el más votado manda sobre el
 * automático; mientras no se sabe si hay votado, `undefined` (no se pinta el
 * automático para cambiarlo después).
 */
export default function useSpotlightLogo(itemId, mediaType, enabled = true) {
  const type = mediaType === "tv" ? "tv" : "movie";
  const { path: chosenLogo, pending: chosenLogoPending } = useCardArtworkState(
    type,
    enabled ? itemId : null,
    "logo",
  );
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

  if (enabled && chosenLogo) return chosenLogo;
  if (enabled && chosenLogoPending) return undefined;
  return state;
}
