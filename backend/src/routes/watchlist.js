// src/routes/watchlist.js
// CRUD completo de watchlist (pendientes)

import { z } from 'zod';
import { db } from '../db/client.js';
import { watchlist } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';

const itemSchema = z.object({
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(['movie', 'tv']),
  title: z.string().optional(),
  posterPath: z.string().optional(),
  priority: z.number().int().min(0).max(9999).optional(),
});

export default async function watchlistRoutes(fastify) {
  fastify.addHook('preHandler', fastify.requireAuth);

  // GET /watchlist
  fastify.get('/', async (req, reply) => {
    const { type, page = 1, limit = 50, sort = 'added_at' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

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
      .limit(Number(limit))
      .offset(offset);

    return reply.send({ results: items, page: Number(page) });
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
