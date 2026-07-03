// Clave de deduplicación de un visionado sincronizado en tiempo real.
//   - Episodio conocido → se agrupa por (tmdbId, tipo, temporada, episodio) en
//     ventanas de 12 h (para no duplicar el mismo episodio en una misma sesión).
//   - Nivel serie (episode == null) → se agrupa por (tmdbId, tipo, día): a lo
//     sumo una entrada show-level por día.
export function syncDedupKey({ tmdbId, mediaType, season, episode, watchedAt }) {
  const t = new Date(watchedAt || Date.now());
  if (episode == null) {
    const day = t.toISOString().slice(0, 10);
    return `show:${mediaType}:${tmdbId}:${day}`;
  }
  const bucket = Math.floor(t.getTime() / (12 * 60 * 60 * 1000));
  return `ep:${mediaType}:${tmdbId}:${season}:${episode}:${bucket}`;
}
