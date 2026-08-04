"use client";

// Nota de IMDb de cada carta de recomendaciones.
//
// Va en su propio módulo (y no junto al arte) porque es otra fuente y otro
// coste: hacen falta DOS peticiones encadenadas —el `imdb_id` del título en
// TMDb y después la nota— mientras que el arte se resuelve con una sola.
// Separarlo permite además que la carta pinte de inmediato con la nota de TMDb
// y añada la de IMDb cuando llegue, sin bloquear nada.
//
// Se cachea por título, incluidos los fallos (como `null`): si un título no
// tiene ficha en IMDb, reintentarlo en cada render no lo va a arreglar.

import { useEffect, useState } from "react";
import { getExternalIds } from "@/lib/api/tmdb";
import { fetchImdbRatingByImdb } from "@/lib/api/imdbRatings";

const ratingCache = new Map(); // "movie:123" -> { value, votes } | null

function cacheKey(mediaType, tmdbId) {
  return `${mediaType === "tv" ? "tv" : "movie"}:${tmdbId}`;
}

export async function loadCardImdbRating(item) {
  if (!item?.tmdbId) return null;
  const key = cacheKey(item.mediaType, item.tmdbId);
  if (ratingCache.has(key)) return ratingCache.get(key);

  let result = null;
  try {
    const type = item.mediaType === "tv" ? "tv" : "movie";
    const imdbId = item.imdbId || (await getExternalIds(type, item.tmdbId))?.imdb_id;
    if (imdbId) {
      const rating = await fetchImdbRatingByImdb(imdbId);
      if (typeof rating?.rating === "number") {
        result = { value: rating.rating.toFixed(1), votes: rating.votes ?? null };
      }
    }
  } catch {
    result = null;
  }

  ratingCache.set(key, result);
  return result;
}

/** Precarga la nota de las siguientes cartas para que no aparezca a destiempo. */
export function prefetchCardImdbRating(items = []) {
  for (const item of items) {
    if (!item?.tmdbId) continue;
    if (ratingCache.has(cacheKey(item.mediaType, item.tmdbId))) continue;
    loadCardImdbRating(item).catch(() => {});
  }
}

export function useCardImdbRating(item) {
  const key = item ? cacheKey(item.mediaType, item.tmdbId) : null;
  const [rating, setRating] = useState(() =>
    key && ratingCache.has(key) ? ratingCache.get(key) : null,
  );

  useEffect(() => {
    if (!item?.tmdbId) {
      setRating(null);
      return undefined;
    }
    if (ratingCache.has(key)) {
      setRating(ratingCache.get(key));
      return undefined;
    }

    let cancelled = false;
    setRating(null);
    loadCardImdbRating(item).then((result) => {
      if (!cancelled) setRating(result);
    });
    return () => {
      cancelled = true;
    };
  }, [key, item]);

  return rating;
}
