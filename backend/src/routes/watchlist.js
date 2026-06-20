// src/routes/watchlist.js
// CRUD completo de watchlist (pendientes)

import { z } from 'zod';
import { db } from '../db/client.js';
import { watchlist, userRatings } from '../db/schema.js';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { getMediaMetadataMap, hydrateMediaRow } from '../utils/mediaMetadata.js';

const itemSchema = z.object({
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(['movie', 'tv']),
  title: z.string().optional(),
  posterPath: z.string().optional(),
  priority: z.number().int().min(0).max(9999).optional(),
});

function clampPageLimit(value, { fallback = 100, max = 1000 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, Math.floor(n));
}

export default async function watchlistRoutes(fastify) {
  fastify.addHook('preHandler', fastify.requireAuth);

  // GET /watchlist
  fastify.get('/', async (req, reply) => {
    const { type, page = 1, limit = 50, sort = 'added_at' } = req.query;
    const safeLimit = clampPageLimit(limit);
    const safePage = Math.max(1, Math.floor(Number(page) || 1));
    const offset = (safePage - 1) * safeLimit;

    const conditions = [eq(watchlist.userId, req.user.id)];
    if (type === 'movie' || type === 'tv') {
      conditions.push(eq(watchlist.mediaType, type));
    }

    const orderCol = sort === 'priority' ? watchlist.priority : watchlist.addedAt;

    const items = await db
      .select()
      .from(watchlist)
      .where(and(...conditions))
      .orderBy(desc(orderCol))
      .limit(safeLimit)
      .offset(offset);

    const tmdbIds = [...new Set(items.map((item) => item.tmdbId).filter(Boolean))];
    const [metadataByKey, ratings] = await Promise.all([
      getMediaMetadataMap(items),
      tmdbIds.length
        ? db
            .select({
              tmdbId: userRatings.tmdbId,
              mediaType: userRatings.mediaType,
              rating: userRatings.rating,
            })
            .from(userRatings)
            .where(and(eq(userRatings.userId, req.user.id), inArray(userRatings.tmdbId, tmdbIds)))
        : [],
    ]);
    const ratingByKey = new Map(
      ratings.map((rating) => [`${rating.mediaType}:${rating.tmdbId}`, rating.rating])
    );
    const results = items.map((item) => ({
      ...hydrateMediaRow(item, metadataByKey),
      userRating: ratingByKey.get(`${item.mediaType}:${item.tmdbId}`) ?? null,
    }));

    return reply.send({ results, page: safePage, limit: safeLimit });
  });

  // POST /watchlist — Añadir a watchlist
  fastify.post('/', async (req, reply) => {
    const parsed = itemSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', issues: parsed.error.issues });
    }

    const { tmdbId, mediaType, title, posterPath, priority = 0 } = parsed.data;

    const [item] = await db
      .insert(watchlist)
      .values({
        userId: req.user.id,
        tmdbId,
        mediaType,
        title: title || null,
        posterPath: posterPath || null,
        priority,
      })
      .onConflictDoUpdate({
        target: [watchlist.userId, watchlist.tmdbId, watchlist.mediaType],
        set: { addedAt: new Date(), priority },
      })
      .returning();

    return reply.status(201).send({ item });
  });

  // DELETE /watchlist/:tmdbId/:mediaType
  fastify.delete('/:tmdbId/:mediaType', async (req, reply) => {
    const tmdbId = Number(req.params.tmdbId);
    const { mediaType } = req.params;

    if (!['movie', 'tv'].includes(mediaType)) {
      return reply.status(400).send({ error: 'Invalid mediaType' });
    }

    await db
      .delete(watchlist)
      .where(
        and(
          eq(watchlist.userId, req.user.id),
          eq(watchlist.tmdbId, tmdbId),
          eq(watchlist.mediaType, mediaType)
        )
      );

    return reply.send({ ok: true });
  });

  // PATCH /watchlist/:tmdbId/:mediaType — Actualizar prioridad
  fastify.patch('/:tmdbId/:mediaType', async (req, reply) => {
    const tmdbId = Number(req.params.tmdbId);
    const { mediaType } = req.params;
    const { priority } = req.body || {};

    if (priority === undefined) {
      return reply.status(400).send({ error: 'priority required' });
    }

    const [item] = await db
      .update(watchlist)
      .set({ priority: Number(priority) })
      .where(
        and(
          eq(watchlist.userId, req.user.id),
          eq(watchlist.tmdbId, tmdbId),
          eq(watchlist.mediaType, mediaType)
        )
      )
      .returning();

    if (!item) return reply.status(404).send({ error: 'Not found in watchlist' });
    return reply.send({ item });
  });

  // GET /watchlist/check/:tmdbId/:mediaType
  fastify.get('/check/:tmdbId/:mediaType', async (req, reply) => {
    const tmdbId = Number(req.params.tmdbId);
    const { mediaType } = req.params;

    const [item] = await db
      .select({ id: watchlist.id, addedAt: watchlist.addedAt, priority: watchlist.priority })
      .from(watchlist)
      .where(
        and(
          eq(watchlist.userId, req.user.id),
          eq(watchlist.tmdbId, tmdbId),
          eq(watchlist.mediaType, mediaType)
        )
      )
      .limit(1);

    return reply.send({ inWatchlist: !!item, item: item || null });
  });
}
