// src/routes/items.js
// Endpoint de estado unificado — reemplaza /api/trakt/item/status
// Devuelve en una sola llamada: favorite, inWatchlist, watched, rating, watchedBySeason

import { db } from '../db/client.js';
import { favorites, watchlist, watchHistory, userRatings } from '../db/schema.js';
import { eq, and, desc, isNotNull } from 'drizzle-orm';

export default async function itemsRoutes(fastify) {
  fastify.addHook('preHandler', fastify.requireAuth);

  // ──────────────────────────────────────────────
  // GET /items/:tmdbId/:mediaType/status
  // Replica exacta de la respuesta de /api/trakt/item/status
  // El frontend puede usar este endpoint sin cambios
  // ──────────────────────────────────────────────
  fastify.get('/:tmdbId/:mediaType/status', async (req, reply) => {
    const tmdbId = Number(req.params.tmdbId);
    const { mediaType } = req.params;

    if (!['movie', 'tv'].includes(mediaType)) {
      return reply.status(400).send({ error: 'Invalid mediaType' });
    }

    const userId = req.user.id;

    // Lanzar todas las queries en paralelo
    const [
      favoriteResult,
      watchlistResult,
      ratingResult,
      historyResult,
    ] = await Promise.all([
      // ¿En favoritos?
      db
        .select({ id: favorites.id, addedAt: favorites.addedAt })
        .from(favorites)
        .where(and(eq(favorites.userId, userId), eq(favorites.tmdbId, tmdbId), eq(favorites.mediaType, mediaType)))
        .limit(1),

      // ¿En watchlist?
      db
        .select({ id: watchlist.id, addedAt: watchlist.addedAt })
        .from(watchlist)
        .where(and(eq(watchlist.userId, userId), eq(watchlist.tmdbId, tmdbId), eq(watchlist.mediaType, mediaType)))
        .limit(1),

      // ¿Tiene rating?
      db
        .select({ rating: userRatings.rating, ratedAt: userRatings.ratedAt })
        .from(userRatings)
        .where(and(
          eq(userRatings.userId, userId),
          eq(userRatings.tmdbId, tmdbId),
          eq(userRatings.mediaType, mediaType)
        ))
        .limit(1),

      // ¿Visto?
      mediaType === 'movie'
        ? db
            .select({ id: watchHistory.id, watchedAt: watchHistory.watchedAt })
            .from(watchHistory)
            .where(and(eq(watchHistory.userId, userId), eq(watchHistory.tmdbId, tmdbId), eq(watchHistory.mediaType, 'movie')))
            .orderBy(desc(watchHistory.watchedAt))
        : db
            .select({ season: watchHistory.season, episode: watchHistory.episode, watchedAt: watchHistory.watchedAt })
            .from(watchHistory)
            .where(and(
              eq(watchHistory.userId, userId),
              eq(watchHistory.tmdbId, tmdbId),
              eq(watchHistory.mediaType, 'tv'),
              isNotNull(watchHistory.season),
              isNotNull(watchHistory.episode)
            ))
            .orderBy(desc(watchHistory.watchedAt)),
    ]);

    const isFavorite = favoriteResult.length > 0;
    const inWatchlist = watchlistResult.length > 0;
    const rating = ratingResult[0]?.rating || null;

    // Para películas: plays count y última fecha
    let watched = false;
    let plays = 0;
    let lastWatchedAt = null;
    let watchedBySeason = null;

    if (mediaType === 'movie') {
      watched = historyResult.length > 0;
      plays = historyResult.length;
      lastWatchedAt = historyResult[0]?.watchedAt || null;
    } else {
      // Para series: construir watchedBySeason
      watchedBySeason = {};
      for (const ep of historyResult) {
        const key = String(ep.season);
        if (!watchedBySeason[key]) watchedBySeason[key] = [];
        if (!watchedBySeason[key].includes(ep.episode)) {
          watchedBySeason[key].push(ep.episode);
        }
      }
      watched = Object.keys(watchedBySeason).length > 0;
    }

    return reply.send({
      connected: true,
      tmdbId,
      mediaType,
      favorite: isFavorite,
      favoriteAddedAt: favoriteResult[0]?.addedAt || null,
      watchlist: inWatchlist,
      watchlistAddedAt: watchlistResult[0]?.addedAt || null,
      watched,
      plays,
      lastWatchedAt,
      rating,
      ratedAt: ratingResult[0]?.ratedAt || null,
      history: mediaType === 'movie' ? historyResult.map((h) => ({ id: h.id, watchedAt: h.watchedAt })) : [],
      // Solo para series:
      ...(mediaType === 'tv' && { watchedBySeason }),
    });
  });
}
