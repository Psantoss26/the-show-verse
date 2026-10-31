"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useCardArtworkState } from "@/lib/hooks/useOwnCardPoster";
import { peekEnglishPosterPath, resolveEnglishPosterPath } from "@/lib/tmdb/englishPosters";

// Póster de UNA tarjeta con el criterio de las páginas de usuario: la portada
// elegida en la ficha, si no la más votada por todos y, sin ninguna, la de la
// escalera de idioma (inglés → español → original → sin idioma); el póster que
// trae TMDb solo si la escalera no encuentra ninguno o no se pudo consultar.
// `{ path, pending }`: mientras se decide no se pinta ninguna, para no enseñar
// un instante la automática y cambiarla después. Para tarjetas sueltas (filas
// de la ficha de una persona); las parrillas usan `useEnglishPosterItems`.

const noopSubscribe = () => () => {};

export default function useCardPoster(item, mediaType) {
  const type = mediaType === "tv" ? "tv" : "movie";
  const id = item?.id ?? null;
  const fallback = item?.poster_path || item?.posterPath || null;
  const { path: chosen, pending: chosenPending } = useCardArtworkState(type, id, "poster");

  const key = id != null ? `${type}:${id}` : "";
  // Lo ya resuelto (caché o lote precargado), sin esperar. En el servidor y al
  // hidratar, `undefined`: igual que sin resolver.
  const peeked = useSyncExternalStore(
    noopSubscribe,
    () => {
      if (!key) return null;
      const peek = peekEnglishPosterPath({ id, mediaType: type });
      return peek.hit ? peek.posterPath || null : undefined;
    },
    () => undefined,
  );
  const [resolved, setResolved] = useState(null); // { key, path }

  useEffect(() => {
    if (!key || chosen || peeked !== undefined) return undefined;
    let cancelled = false;
    void resolveEnglishPosterPath({ id, mediaType: type }).then((path) => {
      if (!cancelled) setResolved({ key, path: path || null });
    });
    return () => {
      cancelled = true;
    };
  }, [key, id, type, chosen, peeked]);

  if (chosen) return { path: chosen, pending: false };
  if (!key) return { path: fallback, pending: false };
  if (chosenPending) return { path: null, pending: true };
  const ladder = peeked !== undefined ? peeked : resolved?.key === key ? resolved.path : undefined;
  if (ladder === undefined) return { path: null, pending: true };
  return { path: ladder || fallback, pending: false };
}
