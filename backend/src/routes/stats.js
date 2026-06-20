// src/routes/stats.js
// Estadísticas y dashboard del usuario

import { db } from '../db/client.js';
import { watchHistory, favorites, watchlist, userRatings } from '../db/schema.js';
import { eq, and, gte, lte, count, sql, isNotNull } from 'drizzle-orm';

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

    // Series con al menos un episodio visto. El filtrado final entre
    // "en progreso" y "completadas" se hace en el BFF con metadatos de TMDb.
    const shows = await db
      .select({
        tmdbId: watchHistory.tmdbId,
        title: watchHistory.title,
        posterPath: watchHistory.posterPath,
        lastWatchedAt: sql`MAX(watched_at)`.mapWith(String),
        episodesWatched: sql`COUNT(DISTINCT CONCAT(season::text, '-', episode::text))`.mapWith(Number),
      })
      .from(watchHistory)
      .where(
        and(
          eq(watchHistory.userId, userId),
          eq(watchHistory.mediaType, 'tv'),
          isNotNull(watchHistory.season),
          isNotNull(watchHistory.episode)
        )
      )
      .groupBy(watchHistory.tmdbId, watchHistory.title, watchHistory.posterPath)
      .orderBy(sql`MAX(watched_at) DESC`)
      .limit(limit);

    return reply.send({ results: shows, limit });
  });

  // ──────────────────────────────────────────────
  // GET /stats/shows/completed — Series completadas
  // ──────────────────────────────────────────────
  fastify.get('/shows/completed', async (req, reply) => {
    const userId = req.user.id;

    const shows = await db
      .select({
        tmdbId: watchHistory.tmdbId,
        title: watchHistory.title,
        posterPath: watchHistory.posterPath,
        lastWatchedAt: sql`MAX(watched_at)`.mapWith(String),
        episodesWatched: sql`COUNT(DISTINCT CONCAT(season::text, '-', episode::text))`.mapWith(Number),
      })
      .from(watchHistory)
      .where(
        and(
          eq(watchHistory.userId, userId),
          eq(watchHistory.mediaType, 'tv'),
          isNotNull(watchHistory.season),
          isNotNull(watchHistory.episode)
        )
      )
      .groupBy(watchHistory.tmdbId, watchHistory.title, watchHistory.posterPath)
      .orderBy(sql`MAX(watched_at) DESC`)
      .limit(50);

    return reply.send({ results: shows });
  });
}
