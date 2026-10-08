"use client";

import { pickBestFavoriteEnglishPoster } from "@/lib/details/tmdbImages";
import { fetchTmdbImages } from "@/lib/tmdb/imageRequests";
import { peekListArtwork, requestListArtwork } from "@/lib/tmdb/artworkBatch";

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

/**
 * Lo ya resuelto del título SIN esperar: de esta caché o de lo que trajo el
 * lote del servidor (p. ej. precargado desde el índice de /lists). Así una
 * parrilla precargada pinta sus pósters en el primer render.
 * `{ hit: false }` si aún no se sabe.
 */
export function peekEnglishPosterPath(item) {
  const key = englishPosterKey(item);
  if (!key) return { hit: false };
  if (englishPosterCache.has(key)) return { hit: true, posterPath: englishPosterCache.get(key) };
  const [mediaType, id] = key.split(":");
  const picks = peekListArtwork(mediaType, id);
  if (!picks) return { hit: false };
  englishPosterCache.set(key, picks.poster || null);
  return { hit: true, posterPath: picks.poster || null };
}

/** Ruta del póster inglés del título (o null). Usa y rellena la caché. */
export async function resolveEnglishPosterPath(item, { priority } = {}) {
  const key = englishPosterKey(item);
  if (!key) return null;
  if (englishPosterCache.has(key)) return englishPosterCache.get(key);
  try {
    const mediaType = key.startsWith("tv:") ? "tv" : "movie";
    const tmdbId = item?.tmdbId ?? item?.tmdb_id ?? item?.id;
    // Primero el lote del servidor (una petición para toda la parrilla,
    // cacheada para todos); si falla, /images directamente, como antes.
    const picks = await requestListArtwork(mediaType, tmdbId);
    if (picks) {
      englishPosterCache.set(key, picks.poster || null);
      return picks.poster || null;
    }
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
