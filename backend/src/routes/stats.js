// src/routes/stats.js
// Estadísticas y dashboard del usuario

import { db } from '../db/client.js';
import { watchHistory, favorites, watchlist, userRatings, tmdbCache } from '../db/schema.js';
import { eq, and, gte, lte, count, sql, isNotNull, desc, inArray } from 'drizzle-orm';

const emptyStats = {
  movies: { watched: 0, plays: 0, minutes: 0, comments: 0, collected: 0 },
  shows: { watched: 0, collected: 0, comments: 0 },
  episodes: { watched: 0, plays: 0, minutes: 0, comments: 0, collected: 0 },
  seasons: { comments: 0 },
  ratings: { total: 0, distribution: {} },
  network: { followers: 0, friends: 0 },
};

const DEFAULT_MOVIE_RUNTIME_MINS = 100;
const DEFAULT_EPISODE_RUNTIME_MINS = 45;

function cacheKeyForMedia(mediaType, tmdbId) {
  if (!tmdbId) return null;
  return `tmdb:${mediaType === 'movie' ? 'movie' : 'tv'}:${tmdbId}`;
}

function cacheKeysForMedia(mediaType, tmdbId) {
  const prefixed = cacheKeyForMedia(mediaType, tmdbId);
  if (!prefixed) return [];
  return [prefixed, prefixed.replace(/^tmdb:/, '')];
}

function readCachedRuntimeMins(mediaType, cached) {
  if (!cached) return null;
  if (mediaType === 'movie') {
    const runtime = Number(cached.runtime || 0);
    return Number.isFinite(runtime) && runtime > 0 ? runtime : null;
  }

  const episodeRuntime = Array.isArray(cached.episode_run_time)
    ? Number(cached.episode_run_time.find((value) => Number(value) > 0) || 0)
    : 0;
  return Number.isFinite(episodeRuntime) && episodeRuntime > 0 ? episodeRuntime : null;
}

function fallbackRuntimeMins(mediaType, hasEpisode = false) {
  if (mediaType === 'movie') return DEFAULT_MOVIE_RUNTIME_MINS;
  if (mediaType === 'tv' && hasEpisode) return DEFAULT_EPISODE_RUNTIME_MINS;
  return 0;
}

async function getProfileMetadataMap(rows = []) {
  const keys = [
    ...new Set(
      rows
        .flatMap((row) => cacheKeysForMedia(row.mediaType, row.tmdbId))
        .filter(Boolean)
    ),
  ];

  if (!keys.length) return new Map();

  const hits = await db
    .select({ cacheKey: tmdbCache.cacheKey, data: tmdbCache.data })
    .from(tmdbCache)
    .where(inArray(tmdbCache.cacheKey, keys));

  const metadataByKey = new Map();
  for (const hit of hits) {
    const key = String(hit.cacheKey || '');
    const data = hit.data || {};
    metadataByKey.set(key, data);
    if (key.startsWith('tmdb:')) {
      metadataByKey.set(key.replace(/^tmdb:/, ''), data);
    } else {
      metadataByKey.set(`tmdb:${key}`, data);
    }
  }
  return metadataByKey;
}

function withProfileMetadata(row, metadataByKey) {
  const cached = metadataByKey.get(cacheKeyForMedia(row.mediaType, row.tmdbId)) || null;
  const hasEpisode = Boolean(row.season && row.episode);
  return {
    ...row,
    title: row.title || cached?.title || cached?.name || cached?.original_title || cached?.original_name || null,
    posterPath: row.posterPath || cached?.poster_path || null,
    runtimeMins:
      row.runtimeMins ||
      readCachedRuntimeMins(row.mediaType, cached) ||
      fallbackRuntimeMins(row.mediaType, hasEpisode),
  };
}

function buildProfileTopRows(rows = []) {
  const byId = new Map();
  for (const row of rows) {
    if (!row.tmdbId) continue;
    const key = String(row.tmdbId);
    const current = byId.get(key) || {
      tmdbId: row.tmdbId,
      title: row.title || 'Sin titulo',
      posterPath: row.posterPath || null,
      plays: 0,
      lastWatchedAt: null,
    };
    current.plays += 1;
    if (!current.posterPath && row.posterPath) current.posterPath = row.posterPath;
    if ((!current.title || current.title === 'Sin titulo') && row.title) current.title = row.title;
    if (!current.lastWatchedAt || new Date(row.watchedAt) > new Date(current.lastWatchedAt)) {
      current.lastWatchedAt = row.watchedAt || null;
    }
    byId.set(key, current);
  }

  return [...byId.values()]
    .sort((a, b) => {
      if (b.plays !== a.plays) return b.plays - a.plays;
      return new Date(b.lastWatchedAt || 0) - new Date(a.lastWatchedAt || 0);
    })
    .slice(0, 20);
}

function genreName(genre) {
  if (!genre) return null;
  if (typeof genre === 'string') return genre;
  return genre.name || null;
}

function buildGenreDistribution(rows = [], metadataByKey) {
  const distribution = {};

  for (const row of rows) {
    const cached = metadataByKey.get(cacheKeyForMedia(row.mediaType, row.tmdbId)) || null;
    const genres = Array.isArray(cached?.genres) ? cached.genres : [];

    for (const genre of genres) {
      const name = genreName(genre);
      if (!name) continue;
      distribution[name] = (distribution[name] || 0) + 1;
    }
  }

  return distribution;
}

function ratingBucket(value) {
  const rating = Number(value);
  if (!Number.isFinite(rating) || rating <= 0) return null;
  return String(Math.round(rating * 2) / 2).replace(/\.0$/, '');
}

function showMetadataFor(metadataByKey, tmdbId) {
  return metadataByKey.get(cacheKeyForMedia('tv', tmdbId)) || null;
}

function showTitleFromMetadata(metadata) {
  return metadata?.name || metadata?.original_name || metadata?.title || null;
}

function showGenreNames(metadata) {
  return Array.isArray(metadata?.genres)
    ? metadata.genres
        .map((genre) => (typeof genre === 'string' ? genre : genre?.name))
        .filter(Boolean)
    : [];
}

function buildSeasonEpisodeCounts(metadata) {
  const counts = {};
  if (!Array.isArray(metadata?.seasons)) return counts;
  for (const season of metadata.seasons) {
    const seasonNumber = Number(season?.season_number);
    const episodeCount = Number(season?.episode_count || 0);
    if (seasonNumber > 0 && episodeCount > 0) {
      counts[seasonNumber] = episodeCount;
    }
  }
  return counts;
}

function findNextEpisode(watchedKeys, seasonEpisodeCounts) {
  const seasons = Object.keys(seasonEpisodeCounts).map(Number).sort((a, b) => a - b);
  for (const season of seasons) {
    const maxEpisode = seasonEpisodeCounts[season];
    for (let episode = 1; episode <= maxEpisode; episode += 1) {
      if (!watchedKeys.has(`${season}-${episode}`)) {
        return { season, number: episode, title: null };
      }
    }
  }
  return null;
}

function buildShowProgressItems(rows = [], metadataByKey, userRatingByTmdbId = new Map()) {
  const byShow = new Map();

  for (const row of rows) {
    if (!row.tmdbId) continue;
    const key = String(row.tmdbId);
    const current = byShow.get(key) || {
      tmdbId: row.tmdbId,
      title: null,
      posterPath: null,
      lastWatchedAt: null,
      watchedKeys: new Set(),
      latestEpisode: null,
    };

    if (!current.title && row.title) current.title = row.title;
    if (!current.posterPath && row.posterPath) current.posterPath = row.posterPath;
    if (row.season != null && row.episode != null) {
      current.watchedKeys.add(`${row.season}-${row.episode}`);
      const watchedAt = row.watchedAt || null;
      if (!current.latestEpisode || new Date(watchedAt || 0) > new Date(current.latestEpisode.watchedAt || 0)) {
        current.latestEpisode = {
          season: row.season,
          number: row.episode,
          title: row.title || null,
          watchedAt,
        };
      }
    }
    if (!current.lastWatchedAt || new Date(row.watchedAt || 0) > new Date(current.lastWatchedAt || 0)) {
      current.lastWatchedAt = row.watchedAt || null;
    }
    byShow.set(key, current);
  }

  return [...byShow.values()]
    .map((show) => {
      const metadata = showMetadataFor(metadataByKey, show.tmdbId);
      const aired = Number(metadata?.number_of_episodes || 0);
      const completed = show.watchedKeys.size;
      const hasKnownAired = aired > 0;
      const pct = hasKnownAired ? Math.min(100, Math.round((completed / aired) * 100)) : 0;
      const seasonEpisodeCounts = buildSeasonEpisodeCounts(metadata);
      const firstAirDate = metadata?.first_air_date || null;
      const title = showTitleFromMetadata(metadata) || show.title || 'Sin título';

      return {
        traktId: null,
        tmdbId: show.tmdbId,
        title,
        title_es: showTitleFromMetadata(metadata) || title,
        year: firstAirDate ? String(firstAirDate).slice(0, 4) : null,
        aired,
        hasKnownAired,
        completed,
        pct,
        nextEpisode: findNextEpisode(show.watchedKeys, seasonEpisodeCounts),
        lastEpisode: show.latestEpisode
          ? {
              season: show.latestEpisode.season,
              number: show.latestEpisode.number,
              title: show.latestEpisode.title,
            }
          : null,
        lastWatchedAt: show.lastWatchedAt,
        user_rating: userRatingByTmdbId.get(Number(show.tmdbId)) || null,
        poster_path: show.posterPath || metadata?.poster_path || null,
        backdrop_path: metadata?.backdrop_path || null,
        first_air_date: firstAirDate,
        vote_average: metadata?.vote_average ?? null,
        overview: metadata?.overview || null,
        number_of_seasons: metadata?.number_of_seasons || null,
        total_episodes: aired || null,
        genres: showGenreNames(metadata),
        tmdb_status: metadata?.status || null,
        networks: Array.isArray(metadata?.networks) ? metadata.networks : [],
        detailsHref: `/details/tv/${show.tmdbId}`,
      };
    })
    .sort((a, b) => new Date(b.lastWatchedAt || 0) - new Date(a.lastWatchedAt || 0));
}

function mediaTypeToProfileType(mediaType) {
  return mediaType === 'movie' ? 'movie' : 'show';
}

function mediaDetailsHref(mediaType, tmdbId) {
  if (!tmdbId) return null;
  return `/details/${mediaType === 'movie' ? 'movie' : 'tv'}/${tmdbId}`;
}

function normalizeProfileMediaRow(row, dateKey, sourceDateKey = dateKey) {
  const type = mediaTypeToProfileType(row.mediaType);
  const normalized = {
    id: row.id || `${row.mediaType}:${row.tmdbId}:${row[dateKey] || ''}`,
    type,
    tmdbId: row.tmdbId,
    title: row.title || 'Sin titulo',
    name: row.title || 'Sin titulo',
    poster_path: row.posterPath || null,
    detailsHref: mediaDetailsHref(row.mediaType, row.tmdbId),
    [dateKey]: row[sourceDateKey] || null,
  };

  if (row.mediaType === 'tv') {
    normalized.season = row.season || null;
    normalized.number = row.episode || null;
    if (row.season && row.episode) {
      normalized.episode = {
        season: row.season,
        number: row.episode,
        title: row.title || null,
      };
      normalized.detailsHref = `/details/tv/${row.tmdbId}/season/${row.season}/episode/${row.episode}`;
    }
  }

  return normalized;
}

function normalizeRatingRow(row) {
  const type = row.mediaType === 'movie' ? 'movie' : row.mediaType === 'tv' ? 'show' : 'show';
  return {
    id: row.id,
    type,
    tmdbId: row.tmdbId,
    title: row.title || 'Sin titulo',
    name: row.title || 'Sin titulo',
    poster_path: row.posterPath || null,
    rating: row.rating,
    rated_at: row.ratedAt || row.updatedAt || null,
    detailsHref:
      row.mediaType === 'episode' && row.season && row.episode
        ? `/details/tv/${row.tmdbId}/season/${row.season}/episode/${row.episode}`
        : mediaDetailsHref(row.mediaType, row.tmdbId),
    ...(row.mediaType === 'episode'
      ? {
          season: row.season || null,
          number: row.episode || null,
          episode: {
            season: row.season || null,
            number: row.episode || null,
            title: row.title || null,
          },
        }
      : {}),
  };
}

function normalizeWatchlistRow(row) {
  const type = mediaTypeToProfileType(row.mediaType);
  return {
    id: row.id,
    type,
    tmdbId: row.tmdbId,
    title: row.title || 'Sin titulo',
    name: row.title || 'Sin titulo',
    poster_path: row.posterPath || null,
    listed_at: row.addedAt || null,
    detailsHref: mediaDetailsHref(row.mediaType, row.tmdbId),
  };
}

function normalizeTopMovie(row) {
  return {
    plays: Number(row.plays || 0),
    last_watched_at: row.lastWatchedAt || null,
    movie: {
      title: row.title || 'Sin titulo',
      year: null,
      ids: { tmdb: row.tmdbId },
      poster_path: row.posterPath || null,
    },
  };
}

function normalizeTopShow(row) {
  return {
    plays: Number(row.plays || 0),
    last_watched_at: row.lastWatchedAt || null,
    show: {
      title: row.title || 'Sin titulo',
      year: null,
      ids: { tmdb: row.tmdbId },
      poster_path: row.posterPath || null,
    },
  };
}

export default async function statsRoutes(fastify) {
  fastify.addHook('preHandler', fastify.requireAuth);

  // ──────────────────────────────────────────────
  // GET /stats — Estadísticas globales del usuario
  // ──────────────────────────────────────────────
  fastify.get('/', async (req, reply) => {
    const userId = req.user.id;

    const [moviesWatched, episodesWatched, totalFavorites, totalWatchlist, totalRatings] =
      await Promise.all([
        // Películas vistas (únicas)
        db
          .select({ count: sql`COUNT(DISTINCT tmdb_id)`.mapWith(Number) })
          .from(watchHistory)
          .where(and(eq(watchHistory.userId, userId), eq(watchHistory.mediaType, 'movie'))),

        // Episodios vistos
        db
          .select({ count: count() })
          .from(watchHistory)
          .where(
            and(
              eq(watchHistory.userId, userId),
              eq(watchHistory.mediaType, 'tv'),
              isNotNull(watchHistory.season),
              isNotNull(watchHistory.episode)
            )
          ),

        // Total favoritos
        db.select({ count: count() }).from(favorites).where(eq(favorites.userId, userId)),

        // Total watchlist
        db.select({ count: count() }).from(watchlist).where(eq(watchlist.userId, userId)),

        // Total ratings
        db.select({ count: count() }).from(userRatings).where(eq(userRatings.userId, userId)),
      ]);

    return reply.send({
      moviesWatched: moviesWatched[0]?.count || 0,
      episodesWatched: episodesWatched[0]?.count || 0,
      totalFavorites: totalFavorites[0]?.count || 0,
      totalWatchlist: totalWatchlist[0]?.count || 0,
      totalRatings: totalRatings[0]?.count || 0,
    });
  });

  // ──────────────────────────────────────────────
  // GET /stats/profile — Perfil completo desde PostgreSQL propio
  // Sin llamadas a Trakt, TMDb ni otros terceros.
  // ──────────────────────────────────────────────
  fastify.get('/profile', async (req, reply) => {
    const userId = req.user.id;

    const [
      showStats,
      totalFavorites,
      totalWatchlist,
      totalRatings,
      ratingRows,
      recentRatingRows,
      watchlistRowsRaw,
      profileHistoryRowsRaw,
    ] = await Promise.all([
      db
        .select({ watched: sql`COUNT(DISTINCT ${watchHistory.tmdbId})`.mapWith(Number) })
        .from(watchHistory)
        .where(and(eq(watchHistory.userId, userId), eq(watchHistory.mediaType, 'tv'))),

      db.select({ count: count() }).from(favorites).where(eq(favorites.userId, userId)),
      db.select({ count: count() }).from(watchlist).where(eq(watchlist.userId, userId)),
      db.select({ count: count() }).from(userRatings).where(eq(userRatings.userId, userId)),

      db
        .select({ rating: userRatings.rating })
        .from(userRatings)
        .where(eq(userRatings.userId, userId)),

      db
        .select()
        .from(userRatings)
        .where(eq(userRatings.userId, userId))
        .orderBy(desc(userRatings.ratedAt))
        .limit(20),

      db
        .select()
        .from(watchlist)
        .where(eq(watchlist.userId, userId))
        .orderBy(desc(watchlist.addedAt))
        .limit(20),

      db
        .select()
        .from(watchHistory)
        .where(eq(watchHistory.userId, userId))
        .orderBy(desc(watchHistory.watchedAt))
        .limit(1500),
    ]);

    const metadataByKey = await getProfileMetadataMap([
      ...profileHistoryRowsRaw,
      ...recentRatingRows,
      ...watchlistRowsRaw,
    ]);
    const profileHistoryRows = profileHistoryRowsRaw.map((row) => withProfileMetadata(row, metadataByKey));
    const recentHistoryRows = profileHistoryRows.slice(0, 20);
    const watchlistRows = watchlistRowsRaw.map((row) => withProfileMetadata(row, metadataByKey));
    const recentRatings = recentRatingRows.map((row) => withProfileMetadata(row, metadataByKey));

    const movieHistoryRows = profileHistoryRows.filter((row) => row.mediaType === 'movie');
    const episodeHistoryRows = profileHistoryRows.filter(
      (row) => row.mediaType === 'tv' && row.season && row.episode
    );
    const movieStats = {
      watched: new Set(movieHistoryRows.map((row) => row.tmdbId)).size,
      plays: movieHistoryRows.length,
      minutes: movieHistoryRows.reduce((sum, row) => sum + Number(row.runtimeMins || 0), 0),
    };
    const episodeStats = {
      watched: episodeHistoryRows.length,
      plays: episodeHistoryRows.length,
      minutes: episodeHistoryRows.reduce((sum, row) => sum + Number(row.runtimeMins || 0), 0),
    };
    const topMovieRows = buildProfileTopRows(movieHistoryRows);
    const topShowRows = buildProfileTopRows(profileHistoryRows.filter((row) => row.mediaType === 'tv'));

    const ratingDistribution = {};
    for (const row of ratingRows) {
      const key = ratingBucket(row.rating);
      if (!key) continue;
      ratingDistribution[key] = (ratingDistribution[key] || 0) + 1;
    }

    const movies = movieStats || emptyStats.movies;
    const episodes = episodeStats || emptyStats.episodes;
    const shows = showStats[0] || emptyStats.shows;
    const favoritesCount = Number(totalFavorites[0]?.count || 0);
    const watchlistCount = Number(totalWatchlist[0]?.count || 0);
    const ratingsCount = Number(totalRatings[0]?.count || 0);

    return reply.send({
      source: 'showverse',
      user: {
        username: req.user.username,
        name: req.user.displayName || req.user.username,
        avatarUrl: req.user.avatarUrl || null,
        about: null,
        location: null,
        joined_at: null,
        private: false,
        vip: req.user.plan && req.user.plan !== 'free',
        vip_ep: false,
        slug: req.user.username,
        provider: 'showverse',
      },
      stats: {
        ...emptyStats,
        movies: {
          ...emptyStats.movies,
          watched: Number(movies.watched || 0),
          plays: Number(movies.plays || 0),
          minutes: Number(movies.minutes || 0),
          collected: favoritesCount,
        },
        shows: {
          ...emptyStats.shows,
          watched: Number(shows.watched || 0),
          collected: favoritesCount,
        },
        episodes: {
          ...emptyStats.episodes,
          watched: Number(episodes.watched || 0),
          plays: Number(episodes.plays || 0),
          minutes: Number(episodes.minutes || 0),
        },
        ratings: {
          total: ratingsCount,
          distribution: ratingDistribution,
        },
        collection: {
          favorites: favoritesCount,
          watchlist: watchlistCount,
        },
      },
      history: profileHistoryRows.map((row) => normalizeProfileMediaRow(row, 'watched_at', 'watchedAt')),
      recentHistory: recentHistoryRows.map((row) => normalizeProfileMediaRow(row, 'watched_at', 'watchedAt')),
      recentRatings: recentRatings.map(normalizeRatingRow),
      watchlist: watchlistRows.map(normalizeWatchlistRow),
      genres: buildGenreDistribution(profileHistoryRows, metadataByKey),
      watchedMovies: topMovieRows.map(normalizeTopMovie),
      watchedShows: topShowRows.map(normalizeTopShow),
      topActors: [],
      topDirectors: [],
    });
  });

  // ──────────────────────────────────────────────
  // GET /stats/calendar?from=&to= — Actividad por días
  // ──────────────────────────────────────────────
  fastify.get('/calendar', async (req, reply) => {
    const { from, to } = req.query;
    const userId = req.user.id;

    const conditions = [eq(watchHistory.userId, userId)];
    if (from) conditions.push(gte(watchHistory.watchedAt, new Date(from)));
    if (to) conditions.push(lte(watchHistory.watchedAt, new Date(to)));

    const items = await db
      .select({
        date: sql`DATE(watched_at AT TIME ZONE 'UTC')`.mapWith(String),
        count: count(),
        mediaType: watchHistory.mediaType,
      })
      .from(watchHistory)
      .where(and(...conditions))
      .groupBy(sql`DATE(watched_at AT TIME ZONE 'UTC')`, watchHistory.mediaType)
      .orderBy(sql`DATE(watched_at AT TIME ZONE 'UTC')`);

    // Agrupar por fecha
    const byDate = {};
    for (const row of items) {
      if (!byDate[row.date]) byDate[row.date] = { date: row.date, movies: 0, episodes: 0, total: 0 };
      if (row.mediaType === 'movie') byDate[row.date].movies += row.count;
      else byDate[row.date].episodes += row.count;
      byDate[row.date].total += row.count;
    }

    return reply.send({ calendar: Object.values(byDate) });
  });

  // ──────────────────────────────────────────────
  // GET /stats/shows/in-progress — Series en progreso
  // ──────────────────────────────────────────────
  fastify.get('/shows/in-progress', async (req, reply) => {
    const userId = req.user.id;
    const rawLimit = Number(req.query?.limit || 1000);
    const limit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(2000, Math.floor(rawLimit)))
      : 1000;

    const rows = await db
      .select()
      .from(watchHistory)
      .where(
        and(
          eq(watchHistory.userId, userId),
          eq(watchHistory.mediaType, 'tv'),
          isNotNull(watchHistory.season),
          isNotNull(watchHistory.episode)
        )
      )
      .orderBy(desc(watchHistory.watchedAt))
      .limit(5000);

    const [metadataByKey, ratingRows] = await Promise.all([
      getProfileMetadataMap(rows),
      db
        .select({ tmdbId: userRatings.tmdbId, rating: userRatings.rating })
        .from(userRatings)
        .where(and(eq(userRatings.userId, userId), eq(userRatings.mediaType, 'tv'))),
    ]);
    const userRatingByTmdbId = new Map(ratingRows.map((row) => [Number(row.tmdbId), row.rating]));
    const shows = buildShowProgressItems(rows, metadataByKey, userRatingByTmdbId)
      .filter((item) => item.completed > 0 && (!item.hasKnownAired || item.completed < item.aired))
      .slice(0, limit);

    return reply.send({ results: shows, limit });
  });

  // ──────────────────────────────────────────────
  // GET /stats/shows/completed — Series completadas
  // ──────────────────────────────────────────────
  fastify.get('/shows/completed', async (req, reply) => {
    const userId = req.user.id;
    const rawLimit = Number(req.query?.limit || 1000);
    const limit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(2000, Math.floor(rawLimit)))
      : 1000;

    const rows = await db
      .select()
      .from(watchHistory)
      .where(
        and(
          eq(watchHistory.userId, userId),
          eq(watchHistory.mediaType, 'tv'),
          isNotNull(watchHistory.season),
          isNotNull(watchHistory.episode)
        )
      )
      .orderBy(desc(watchHistory.watchedAt))
      .limit(5000);

    const [metadataByKey, ratingRows] = await Promise.all([
      getProfileMetadataMap(rows),
      db
        .select({ tmdbId: userRatings.tmdbId, rating: userRatings.rating })
        .from(userRatings)
        .where(and(eq(userRatings.userId, userId), eq(userRatings.mediaType, 'tv'))),
    ]);
    const userRatingByTmdbId = new Map(ratingRows.map((row) => [Number(row.tmdbId), row.rating]));
    const shows = buildShowProgressItems(rows, metadataByKey, userRatingByTmdbId)
      .filter((item) => item.completed > 0 && item.hasKnownAired && item.completed >= item.aired)
      .slice(0, limit);

    return reply.send({ results: shows, limit });
  });
}
