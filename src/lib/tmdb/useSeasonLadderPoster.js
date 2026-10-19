"use client";

import { useEffect, useState } from "react";
import { peekSeasonArtwork, requestSeasonArtwork } from "@/lib/tmdb/artworkBatch";

// Póster de una temporada con la escalera de idioma de toda la app (inglés →
// español → original → sin idioma), por el lote de /api/tmdb/artwork: todas
// las tarjetas de «Temporadas» que montan a la vez van en una petición.
//
// `pending` mientras se resuelve (la tarjeta no enseña el póster de TMDb para
// no cambiarlo delante del usuario); después `poster` es la ruta de la
// escalera, o null si no hay ninguna o el lote falló (la tarjeta cae a la de
// TMDb). Sin `showId` no se consulta nada.
export function useSeasonLadderPoster(showId, seasonNumber) {
  const key = showId ? `${showId}:${seasonNumber}` : null;
  const [result, setResult] = useState({ key: null, picks: undefined });
  // Lo ya resuelto (otra tarjeta, una visita anterior) se pinta en este render.
  const peeked = key ? peekSeasonArtwork(showId, seasonNumber) : undefined;
  const settled = result.key === key;
  const picks = settled ? result.picks : peeked;

  useEffect(() => {
    if (!key || peekSeasonArtwork(showId, seasonNumber) !== undefined) return undefined;
    let cancelled = false;
    void requestSeasonArtwork(showId, seasonNumber).then((value) => {
      if (!cancelled) setResult({ key, picks: value });
    });
    return () => {
      cancelled = true;
    };
  }, [key, showId, seasonNumber]);

  return {
    pending: Boolean(key) && !settled && peeked === undefined,
    poster: picks?.poster || null,
  };
}
