// backend/src/lib/completedShows.js
// Cuenta las series que un usuario ha terminado.
//
// Vive en su propio módulo porque lo usan dos capas que no deben depender una de
// la otra: el perfil (lib/userProfile.js) y el cálculo de XP (level/stats.js).
// Tenerlo aquí evita un ciclo de imports y garantiza que el "series completadas"
// del nivel sea exactamente el mismo número que el usuario ve en su perfil.

import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';

import { watchHistory, tmdbCache } from '../db/schema.js';
import { computeShowProgress } from './showProgress.js';

// Techo de filas de historial que se examinan. Con 5.000 episodios el recuento ya
// es representativo y la consulta sigue siendo acotada.
export const PROFILE_COMPLETED_SHOWS_HISTORY_LIMIT = 5000;

export function mediaCacheKeys(mediaType, tmdbId) {
  const media = mediaType === 'movie' ? 'movie' : 'tv';
  return [`tmdb:${media}:${tmdbId}`, `${media}:${tmdbId}`];
}

export function countCompletedShows(rows, metadataByKey) {
  const playsByShow = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const tmdbId = Number(row?.tmdbId);
    const season = Number(row?.season);
    const episode = Number(row?.episode);
    if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !Number.isInteger(season) || season <= 0 || !Number.isInteger(episode) || episode <= 0) continue;

    const playCounts = playsByShow.get(tmdbId) || new Map();
    const episodeKey = `${season}-${episode}`;
    playCounts.set(episodeKey, (playCounts.get(episodeKey) || 0) + 1);
    playsByShow.set(tmdbId, playCounts);
  }

  let completed = 0;
  for (const [tmdbId, playCounts] of playsByShow) {
    const metadata = metadataByKey?.get(`tmdb:tv:${tmdbId}`)
      || metadataByKey?.get(`tv:${tmdbId}`)
      || {};
    const seasonEpisodeCounts = {};
    for (const season of Array.isArray(metadata.seasons) ? metadata.seasons : []) {
      const seasonNumber = Number(season?.season_number);
      const episodeCount = Number(season?.episode_count || 0);
      if (seasonNumber > 0 && episodeCount > 0) seasonEpisodeCounts[seasonNumber] = episodeCount;
    }
    if (computeShowProgress(playCounts, seasonEpisodeCounts).baseComplete) completed += 1;
  }
  return completed;
}

export async function getCompletedShowsCount(db, targetId) {
  const rows = await db
    .select({
      tmdbId: watchHistory.tmdbId,
      season: watchHistory.season,
      episode: watchHistory.episode,
    })
    .from(watchHistory)
    .where(
      and(
        eq(watchHistory.userId, targetId),
        eq(watchHistory.mediaType, 'tv'),
        isNotNull(watchHistory.season),
        isNotNull(watchHistory.episode),
      ),
    )
    .orderBy(desc(watchHistory.watchedAt))
    .limit(PROFILE_COMPLETED_SHOWS_HISTORY_LIMIT);
  if (!rows.length) return 0;

  const cacheKeys = [...new Set(rows.flatMap((row) => mediaCacheKeys('tv', row.tmdbId)))];
  const cachedRows = cacheKeys.length
    ? await db
      .select({ cacheKey: tmdbCache.cacheKey, data: tmdbCache.data })
      .from(tmdbCache)
      .where(inArray(tmdbCache.cacheKey, cacheKeys))
    : [];
  const metadataByKey = new Map(cachedRows.map((row) => [row.cacheKey, row.data || {}]));
  return countCompletedShows(rows, metadataByKey);
}
