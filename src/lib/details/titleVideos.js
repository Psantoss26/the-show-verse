// Vídeos de un título (película o serie) para el modal de vídeo: TMDb localiza
// la respuesta y muchos títulos solo tienen tráileres en inglés, así que se
// piden ambos idiomas, se unen sin duplicados, se quedan los reproducibles y se
// ordenan con el criterio compartido (`rankVideo`). El mismo criterio que la
// sección «Vídeos» de la ficha (DetailsClient / vista teléfono).

import { getVideos } from "@/lib/api/tmdb";
import { isPlayableVideo, playableRankedVideos, rankVideo, uniqBy } from "@/lib/details/videos";

const cache = new Map(); // "tv:1396" -> Promise<Array>

async function safeFetchVideos(type, id, language) {
  try {
    const result = await getVideos(type, id, language);
    return Array.isArray(result?.results) ? result.results : [];
  } catch {
    return [];
  }
}

/** Vídeos reproducibles de un título, ordenados por relevancia (cacheados). */
export function loadTitleVideos(mediaType, id) {
  const type = mediaType === "tv" ? "tv" : "movie";
  if (!id) return Promise.resolve([]);
  const key = `${type}:${id}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const request = Promise.all([
    safeFetchVideos(type, id, "es-ES"),
    safeFetchVideos(type, id, "en-US"),
  ]).then(([es, en]) => {
    const merged = uniqBy([...es, ...en], (v) => `${v?.site}:${v?.key}`).filter(
      isPlayableVideo,
    );
    merged.sort((a, b) => rankVideo(a) - rankVideo(b));
    // Un fallo (las dos vacías) no se memoriza: se reintenta la próxima vez.
    if (merged.length === 0) cache.delete(key);
    return merged;
  });
  cache.set(key, request);
  return request;
}

const seasonCache = new Map(); // "1396:5" -> Promise<Array>

/**
 * Vídeos de UNA temporada (/tv/{id}/season/{n}/videos). Sus vídeos casi
 * siempre están solo en inglés, así que se piden todos los idiomas útiles en
 * una petición (`include_video_language`), en vez de una por idioma.
 */
export function loadSeasonVideos(showId, seasonNumber) {
  const season = Number(seasonNumber);
  if (!showId || !Number.isInteger(season) || season < 0) return Promise.resolve([]);
  const key = `${showId}:${season}`;
  const cached = seasonCache.get(key);
  if (cached) return cached;

  const request = getVideos("tv", `${showId}/season/${season}`, "es-ES", {
    includeVideoLanguage: "es,en,null",
  })
    .then((result) => playableRankedVideos(result?.results))
    .catch(() => {
      // Fallo de red: no se memoriza, se reintenta al volver.
      seasonCache.delete(key);
      return [];
    });
  seasonCache.set(key, request);
  return request;
}

/**
 * Vídeos de una temporada que ya trajo el servidor (page.jsx de la temporada):
 * quedan en la caché y el cliente no los vuelve a pedir.
 */
export function primeSeasonVideos(showId, seasonNumber, videos) {
  const season = Number(seasonNumber);
  if (!showId || !Number.isInteger(season) || !Array.isArray(videos)) return;
  seasonCache.set(`${showId}:${season}`, Promise.resolve(videos));
}
