"use client";

import { useEffect, useMemo, useState } from "react";
import { pickBestFavoriteEnglishPoster } from "@/lib/details/tmdbImages";
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
 * de Favoritos. Las superficies que no deben revelar el artwork persistido
 * mientras carga pueden ocultarlo mediante `hideOriginalPosters`.
 */
export function useEnglishPosterItems(
  items,
  enabled = true,
  { hideOriginalPosters = false } = {},
) {
  const [resolvedPosters, setResolvedPosters] = useState(() => new Map());
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
        if (englishPosterCache.has(key) && !next.has(key)) {
          next.set(key, englishPosterCache.get(key));
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
          const posterPath = pickBestFavoriteEnglishPoster(images?.posters || [])?.file_path || null;
          englishPosterCache.set(key, posterPath);
          return [key, posterPath];
        } catch {
          // Una petición fallida tampoco debe exponer un póster localizado
          // mientras se está mostrando una parrilla que exige arte inglés.
          englishPosterCache.set(key, null);
          return [key, null];
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setResolvedPosters((current) => {
        const next = new Map(current);
        let changed = false;
        for (const [key, posterPath] of entries) {
          if (!next.has(key) || next.get(key) !== posterPath) {
            next.set(key, posterPath);
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

  return useMemo(
    () => (items || []).map((item) => {
      const key = posterKey(item);
      const posterPath = resolvedPosters.has(key)
        ? resolvedPosters.get(key)
        : englishPosterCache.get(key);
      if (posterPath) return { ...item, posterPath, poster_path: posterPath };
      if (hideOriginalPosters && key) {
        const resolved = resolvedPosters.has(key) || englishPosterCache.has(key);
        return {
          ...item,
          posterPath: null,
          poster_path: null,
          backdropPath: null,
          backdrop_path: null,
          _englishPosterPending: !resolved,
        };
      }
      return item;
    }),
    [items, resolvedPosters, hideOriginalPosters],
  );
}
