// src/routes/favorites.js
// CRUD completo de favoritos

import { z } from 'zod';
import { db } from '../db/client.js';
import { favorites } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';

const itemSchema = z.object({
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(['movie', 'tv']),
  title: z.string().optional(),
  posterPath: z.string().optional(),
});

function clampPageLimit(value, { fallback = 100, max = 1000 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, Math.floor(n));
}

export default async function favoritesRoutes(fastify) {
  // Todas las rutas requieren autenticación
  fastify.addHook('preHandler', fastify.requireAuth);

  // ──────────────────────────────────────────────
  // GET /favorites — Listar favoritos del usuario
  // ──────────────────────────────────────────────
  fastify.get('/', async (req, reply) => {
    const { type, page = 1, limit = 50 } = req.query;
    const safeLimit = clampPageLimit(limit);
    const safePage = Math.max(1, Math.floor(Number(page) || 1));
    const offset = (safePage - 1) * safeLimit;

    const conditions = [eq(favorites.userId, req.user.id)];
    if (type === 'movie' || type === 'tv') {
      conditions.push(eq(favorites.mediaType, type));
    }

    const items = await db
      .select()
      .from(favorites)
      .where(and(...conditions))
      .orderBy(desc(favorites.addedAt))
      .limit(safeLimit)
      .offset(offset);

    return reply.send({ results: items, page: safePage, limit: safeLimit });
  });

  // ──────────────────────────────────────────────
  // POST /favorites — Añadir a favoritos
  // ──────────────────────────────────────────────
  fastify.post('/', async (req, reply) => {
    const parsed = itemSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', issues: parsed.error.issues });
    }

    const { tmdbId, mediaType, title, posterPath } = parsed.data;

    const [item] = await db
      .insert(favorites)
      .values({
        userId: req.user.id,
        tmdbId,
        mediaType,
        title: title || null,
        posterPath: posterPath || null,
      })
      .onConflictDoUpdate({
        target: [favorites.userId, favorites.tmdbId, favorites.mediaType],
        set: { addedAt: new Date() }, // si ya existe, refresca la fecha
      })
      .returning();

    return reply.status(201).send({ item });
  });

  // ──────────────────────────────────────────────
  // DELETE /favorites/:tmdbId/:mediaType — Quitar de favoritos
  // ──────────────────────────────────────────────
  fastify.delete('/:tmdbId/:mediaType', async (req, reply) => {
    const tmdbId = Number(req.params.tmdbId);
    const { mediaType } = req.params;

    if (!['movie', 'tv'].includes(mediaType)) {
      return reply.status(400).send({ error: 'Invalid mediaType' });
    }

    await db
      .delete(favorites)
      .where(
        and(
          eq(favorites.userId, req.user.id),
          eq(favorites.tmdbId, tmdbId),
          eq(favorites.mediaType, mediaType)
        )
      );

    return reply.send({ ok: true });
  });

  // ──────────────────────────────────────────────
  // GET /favorites/check/:tmdbId/:mediaType — ¿Está en favoritos?
  // ──────────────────────────────────────────────
  fastify.get('/check/:tmdbId/:mediaType', async (req, reply) => {
    const tmdbId = Number(req.params.tmdbId);
    const { mediaType } = req.params;

    const [item] = await db
      .select({ id: favorites.id, addedAt: favorites.addedAt })
      .from(favorites)
      .where(
        and(
          eq(favorites.userId, req.user.id),
          eq(favorites.tmdbId, tmdbId),
          eq(favorites.mediaType, mediaType)
        )
      )
      .limit(1);

    return reply.send({ favorite: !!item, item: item || null });
  });
}
