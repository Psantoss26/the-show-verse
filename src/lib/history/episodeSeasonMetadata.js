function normalizeText(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text || null;
}

export function historyEpisodeMetadataKey(season, episode) {
  if (season == null || episode == null) return null;
  const seasonNumber = Number(season);
  const episodeNumber = Number(episode);
  if (!Number.isInteger(seasonNumber) || !Number.isInteger(episodeNumber)) {
    return null;
  }
  return `${seasonNumber}:${episodeNumber}`;
}

export function buildSeasonEpisodeMetadata(payload) {
  const metadata = new Map();
  const episodes = Array.isArray(payload?.episodes) ? payload.episodes : [];

  for (const episode of episodes) {
    const key = historyEpisodeMetadataKey(
      episode?.season_number,
      episode?.episode_number,
    );
    if (!key) continue;

    const title = normalizeText(episode?.name) || normalizeText(episode?.title);
    const stillPath = normalizeText(episode?.still_path);
    if (!title && !stillPath) continue;

    metadata.set(key, { title, stillPath });
  }

  return metadata;
}

// Miniaturas de episodio del modal de episodios agrupados (96–112 px de ancho).
// Los stills de TMDb existen en w92/w185/w300: con `w780` se bajaban ~6 veces
// más bytes de los que se pintan. w185 cubre 1x–1,6x y w300 hasta 3x.
export const HISTORY_EPISODE_STILL_SIZES = "(min-width: 640px) 112px, 96px";

export function historyEpisodeStillSrc(stillPath, size = "w300") {
  const path = normalizeText(stillPath);
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

export function historyEpisodeStillSrcSet(stillPath) {
  const path = normalizeText(stillPath);
  if (!path) return undefined;
  return `https://image.tmdb.org/t/p/w185${path} 185w, https://image.tmdb.org/t/p/w300${path} 300w`;
}

// Metadatos ya resueltos en la caché (sin promesas pendientes) de todas las
// temporadas pedidas, fusionados; null si falta alguna. Permite pintar las
// miniaturas en el PRIMER render del modal cuando la carga se adelantó.
export function readResolvedSeasonMetadata(cache, showId, seasons) {
  if (!showId || !Array.isArray(seasons) || !seasons.length) return null;
  const merged = new Map();
  for (const season of seasons) {
    const cached = cache.get(`${showId}:${season}`);
    if (!(cached instanceof Map)) return null;
    for (const [key, value] of cached) merged.set(key, value);
  }
  return merged;
}
