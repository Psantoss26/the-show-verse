"use client";

// Póster con la ESCALERA DE IDIOMA de las tarjetas (en → es → original → sin
// idioma, lib/tmdb/imageLanguageLadder.js), pedido por lote a
// /api/tmdb/artwork como en Descubrir. Lo comparten las tarjetas del chat del
// Asistente y la ruleta.
//
// `pending` mientras llega el lote: así no se pinta antes el póster del motor
// de recomendaciones y luego se cambia delante del usuario.

import { useEffect, useMemo, useState } from "react";
import { peekListArtwork, requestListArtwork } from "@/lib/tmdb/artworkBatch";

export function mediaTypeOfRecommendation(item) {
  return item?.mediaType === "tv" ? "tv" : "movie";
}

export function useLadderPoster(type, id) {
  const [ladder, setLadder] = useState(() => peekListArtwork(type, id));
  useEffect(() => {
    const peeked = peekListArtwork(type, id);
    setLadder(peeked);
    if (peeked !== undefined) return undefined;
    let alive = true;
    requestListArtwork(type, id).then((picks) => {
      if (alive) setLadder(picks ?? null);
    });
    return () => {
      alive = false;
    };
  }, [type, id]);
  return { path: ladder?.poster || null, pending: ladder === undefined };
}

// Lo mismo para una lista: { "movie:603": "/ruta.jpg" | null } y `pending`
// hasta que llegan todos (un solo lote para toda la lista).
export function useLadderPosters(items) {
  const keys = useMemo(
    () => (items || []).map((item) => [mediaTypeOfRecommendation(item), Number(item?.id)]),
    [items],
  );
  const signature = keys.map(([t, id]) => `${t}:${id}`).join(",");
  const [state, setState] = useState(() => {
    const map = {};
    for (const [t, id] of keys) {
      const peeked = peekListArtwork(t, id);
      if (peeked !== undefined) map[`${t}:${id}`] = peeked?.poster || null;
    }
    return map;
  });

  useEffect(() => {
    let alive = true;
    Promise.all(
      keys.map(([t, id]) => {
        const peeked = peekListArtwork(t, id);
        return peeked !== undefined
          ? Promise.resolve([`${t}:${id}`, peeked?.poster || null])
          : requestListArtwork(t, id).then((picks) => [`${t}:${id}`, picks?.poster || null]);
      }),
    ).then((entries) => {
      if (alive) setState(Object.fromEntries(entries));
    });
    return () => {
      alive = false;
    };
    // `signature` resume `keys`: depender del array recrearía el efecto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const pending = keys.some(([t, id]) => !(`${t}:${id}` in state));
  return { posters: state, pending };
}
