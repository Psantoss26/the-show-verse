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
