"use client";

import { useEffect, useState } from "react";
import { peekSeasonArtwork, requestSeasonArtwork } from "@/lib/tmdb/artworkBatch";
import { useSeededLadderPoster } from "@/lib/details/seasonPosterSeeds";

// Póster de una temporada con la escalera de idioma de toda la app (inglés →
// español → original → sin idioma), por el lote de /api/tmdb/artwork: todas
// las tarjetas de «Temporadas» que montan a la vez van en una petición.
//
// `pending` mientras se resuelve (la tarjeta no enseña el póster de TMDb para
// no cambiarlo delante del usuario); después `poster` es la ruta de la
// escalera, o null si no hay ninguna o el lote falló (la tarjeta cae a la de
// TMDb). Sin `showId` no se consulta nada. Si el SSR de la ficha ya lo trae
// (seasonPosterSeeds), se usa tal cual y no se pide.
export function useSeasonLadderPoster(showId, seasonNumber) {
  const key = showId ? `${showId}:${seasonNumber}` : null;
  const [result, setResult] = useState({ key: null, picks: undefined });
  const seeded = useSeededLadderPoster(showId, seasonNumber);
  // Lo ya resuelto (otra tarjeta, una visita anterior, o si no el SSR) se pinta
  // en este render.
  const known = key ? peekSeasonArtwork(showId, seasonNumber) : undefined;
  const peeked = known !== undefined || !key || seeded === undefined ? known : { poster: seeded };
  const settled = result.key === key;
  const picks = settled ? result.picks : peeked;

  useEffect(() => {
    if (!key || seeded !== undefined || peekSeasonArtwork(showId, seasonNumber) !== undefined) return undefined;
    let cancelled = false;
    void requestSeasonArtwork(showId, seasonNumber).then((value) => {
      if (!cancelled) setResult({ key, picks: value });
    });
    return () => {
      cancelled = true;
    };
  }, [key, showId, seasonNumber, seeded]);

  return {
    pending: Boolean(key) && !settled && peeked === undefined,
    poster: picks?.poster || null,
  };
}
