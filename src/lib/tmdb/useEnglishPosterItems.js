"use client";

import { useEffect, useMemo, useState } from "react";
import { pickBestEnglishPoster } from "@/lib/details/tmdbImages";
import { fetchTmdbImages } from "@/lib/tmdb/imageRequests";

// Compartida por las superficies de Perfil: una misma ficha conserva el
// criterio de portada de DetailsClient sin reescribir el póster persistido.
const englishPosterCache = new Map();

function posterKey(item) {
  const id = item?.tmdbId ?? item?.tmdb_id ?? item?.id;
  if (id == null) return null;
  const rawType = item?.mediaType ?? item?.media_type;
  const mediaType = rawType === "tv" || rawType === "show" || rawType === "episode"
    ? "tv"
    : "movie";
  return `${mediaType}:${id}`;
}

/**
 * Sustituye solo en pantalla el póster de cada título por la elección inglesa
 * de DetailsClient. Si la consulta no devuelve artwork válido, mantiene el
 * posterPath recibido de la BBDD como fallback.
 */
export function useEnglishPosterItems(
  items,
  enabled = true,
  hideFallbackUntilResolved = false,
  returnStatus = false,
) {
  const [resolvedPosters, setResolvedPosters] = useState(() => new Map());
  const [settledPosterKeys, setSettledPosterKeys] = useState(() => new Set());
  const itemKeys = useMemo(
    () => (items || []).map(posterKey).filter(Boolean).join("|"),
    [items],
  );

  useEffect(() => {
    if (!enabled || !itemKeys) return undefined;

    setResolvedPosters((current) => {
      const next = new Map(current);
      let changed = false;
      for (const key of itemKeys.split("|")) {
        const posterPath = englishPosterCache.get(key);
        if (posterPath && next.get(key) !== posterPath) {
          next.set(key, posterPath);
          changed = true;
        }
      }
      return changed ? next : current;
    });
    setSettledPosterKeys((current) => {
      const next = new Set(current);
      let changed = false;
      for (const key of itemKeys.split("|")) {
        if (englishPosterCache.has(key) && !next.has(key)) {
          next.add(key);
          changed = true;
        }
      }
      return changed ? next : current;
    });

    const missingItems = [];
    const seen = new Set();
    for (const item of items || []) {
      const key = posterKey(item);
      if (!key || seen.has(key) || englishPosterCache.has(key)) continue;
      seen.add(key);
      missingItems.push({ key, item });
    }
    if (!missingItems.length) return undefined;

    let cancelled = false;
    void Promise.all(
      missingItems.map(async ({ key, item }) => {
        try {
          const mediaType = key.startsWith("tv:") ? "tv" : "movie";
          const tmdbId = item?.tmdbId ?? item?.tmdb_id ?? item?.id;
          const images = await fetchTmdbImages(mediaType, tmdbId);
          const posterPath = pickBestEnglishPoster(images?.posters || [])?.file_path || null;
          if (posterPath) englishPosterCache.set(key, posterPath);
          return [key, posterPath];
        } catch {
          // La superficie que oculta el fallback se revela igualmente con el
          // artwork persistido si TMDb no puede resolver una alternativa.
          return [key, null];
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setResolvedPosters((current) => {
        const next = new Map(current);
        let changed = false;
        for (const [key, posterPath] of entries) {
          if (posterPath && next.get(key) !== posterPath) {
            next.set(key, posterPath);
            changed = true;
          }
        }
        return changed ? next : current;
      });
      setSettledPosterKeys((current) => {
        const next = new Set(current);
        let changed = false;
        for (const [key] of entries) {
          if (!next.has(key)) {
            next.add(key);
            changed = true;
          }
        }
        return changed ? next : current;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, itemKeys, items]);

  const posterItems = useMemo(
    () => (items || []).map((item) => {
      const key = posterKey(item);
      // La caché compartida puede ya contener la elección inglesa de otra
      // superficie. Léela también durante el render para no pintar el fallback
      // original durante un frame antes de que el efecto sincronice el estado.
      const posterPath = resolvedPosters.get(key) || englishPosterCache.get(key);
      if (posterPath) return { ...item, posterPath, poster_path: posterPath };
      if (enabled && hideFallbackUntilResolved && key && !settledPosterKeys.has(key)) {
        return { ...item, posterPath: null, poster_path: null };
      }
      return item;
    }),
    [enabled, hideFallbackUntilResolved, items, resolvedPosters, settledPosterKeys],
  );

  const isResolving = useMemo(
    () => enabled && (items || []).some((item) => {
      const key = posterKey(item);
      return key && !englishPosterCache.has(key) && !settledPosterKeys.has(key);
    }),
    [enabled, items, settledPosterKeys],
  );

  return returnStatus ? { items: posterItems, isResolving } : posterItems;
}
