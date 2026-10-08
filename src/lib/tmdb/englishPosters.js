"use client";

import { pickBestFavoriteEnglishPoster } from "@/lib/details/tmdbImages";
import { fetchTmdbImages } from "@/lib/tmdb/imageRequests";

// Póster INGLÉS de un título con el criterio de Favoritos/DetailsClient
// (pickBestFavoriteEnglishPoster sobre su galería de TMDb). Lo comparten las
// parrillas de listas (useEnglishPosterItems) y la imagen/vídeo compartibles
// de una lista, para que enseñen exactamente las mismas portadas.
//
// Caché de la pestaña: `null` significa "resuelto, sin póster inglés" (la
// parrilla no pinta entonces el póster guardado, y lo compartido tampoco).
export const englishPosterCache = new Map();

export function englishPosterKey(item) {
  const id = item?.tmdbId ?? item?.tmdb_id ?? item?.id;
  if (id == null) return null;
  const rawType = item?.mediaType ?? item?.media_type;
  const mediaType = rawType === "tv" || rawType === "show" || rawType === "episode"
    ? "tv"
    : "movie";
  return `${mediaType}:${id}`;
}

/** Ruta del póster inglés del título (o null). Usa y rellena la caché. */
export async function resolveEnglishPosterPath(item, { priority } = {}) {
  const key = englishPosterKey(item);
  if (!key) return null;
  if (englishPosterCache.has(key)) return englishPosterCache.get(key);
  try {
    const mediaType = key.startsWith("tv:") ? "tv" : "movie";
    const tmdbId = item?.tmdbId ?? item?.tmdb_id ?? item?.id;
    const images = await fetchTmdbImages(mediaType, tmdbId, priority ? { priority } : undefined);
    const posterPath = pickBestFavoriteEnglishPoster(images?.posters || [])?.file_path || null;
    englishPosterCache.set(key, posterPath);
    return posterPath;
  } catch {
    // Una petición fallida tampoco debe exponer un póster localizado
    // mientras se está mostrando una parrilla que exige arte inglés.
    englishPosterCache.set(key, null);
    return null;
  }
}
