// src/routes/items.js
// Endpoint de estado unificado — reemplaza /api/trakt/item/status
// Devuelve en una sola llamada: favorite, inWatchlist, watched, rating, watchedBySeason

import { db } from '../db/client.js';
import { favorites, watchlist, watchHistory, userRatings } from '../db/schema.js';
import { eq, and, desc, inArray, isNotNull, or } from 'drizzle-orm';
import { z } from 'zod';

const batchStateSchema = z.object({
  items: z.array(z.object({
    tmdbId: z.coerce.number().int().positive(),
    mediaType: z.enum(['movie', 'tv']),
  })).min(1).max(100),
});

function itemStateKey(mediaType, tmdbId) {
  return `${mediaType}:${Number(tmdbId)}`;
}

export default async function itemsRoutes(fastify) {
  fastify.addHook('preHandler', fastify.requireAuth);

  // POST /items/states — estados del usuario actual para un grupo de títulos.
  // Se usa en perfiles sociales para decorar tarjetas ajenas con la biblioteca
  // del visor, sin revelar ninguna información adicional de este.
  fastify.post('/states', async (req, reply) => {
    const parsed = batchStateSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', issues: parsed.error.issues });
    }

    const requestedByKey = new Map();
    for (const item of parsed.data.items) {
      requestedByKey.set(itemStateKey(item.mediaType, item.tmdbId), item);
    }
    const requested = [...requestedByKey.values()];
    const tmdbIds = [...new Set(requested.map((item) => item.tmdbId))];
    const mediaTypes = [...new Set(requested.map((item) => item.mediaType))];
    const userId = req.user.id;

    const [favoriteRows, watchlistRows, historyRows, ratingRows] = await Promise.all([
      db
        .select({ tmdbId: favorites.tmdbId, mediaType: favorites.mediaType })
        .from(favorites)
        .where(and(
          eq(favorites.userId, userId),
          inArray(favorites.tmdbId, tmdbIds),
          inArray(favorites.mediaType, mediaTypes),
        )),
      db
        .select({ tmdbId: watchlist.tmdbId, mediaType: watchlist.mediaType })
        .from(watchlist)
        .where(and(
          eq(watchlist.userId, userId),
          inArray(watchlist.tmdbId, tmdbIds),
          inArray(watchlist.mediaType, mediaTypes),
        )),
      db
        .select({ tmdbId: watchHistory.tmdbId, mediaType: watchHistory.mediaType })
        .from(watchHistory)
        .where(and(
          eq(watchHistory.userId, userId),
          inArray(watchHistory.tmdbId, tmdbIds),
          inArray(watchHistory.mediaType, mediaTypes),
          or(
            eq(watchHistory.mediaType, 'movie'),
            and(
              eq(watchHistory.mediaType, 'tv'),
              isNotNull(watchHistory.season),
              isNotNull(watchHistory.episode),
            ),
          ),
        )),
      db
        .select({
          tmdbId: userRatings.tmdbId,
          mediaType: userRatings.mediaType,
          rating: userRatings.rating,
        })
        .from(userRatings)
        .where(and(
          eq(userRatings.userId, userId),
          inArray(userRatings.tmdbId, tmdbIds),
          inArray(userRatings.mediaType, mediaTypes),
        )),
    ]);

    const states = Object.fromEntries(requested.map((item) => [
      itemStateKey(item.mediaType, item.tmdbId),
      { favorite: false, watchlist: false, watched: false, rating: null },
    ]));
    const update = (row, property, value = true) => {
      const state = states[itemStateKey(row.mediaType, row.tmdbId)];
      if (state) state[property] = value;
    };

    favoriteRows.forEach((row) => update(row, 'favorite'));
    watchlistRows.forEach((row) => update(row, 'watchlist'));
    historyRows.forEach((row) => update(row, 'watched'));
    ratingRows.forEach((row) => update(row, 'rating', Number(row.rating)));

    return reply.send({ states });
  });

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
