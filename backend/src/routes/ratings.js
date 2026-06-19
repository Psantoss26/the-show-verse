// src/routes/ratings.js
// Ratings de usuario (películas, series, episodios)

import { z } from 'zod';
import { db } from '../db/client.js';
import { userRatings } from '../db/schema.js';
import { eq, and, desc, isNull } from 'drizzle-orm';

const ratingSchema = z.object({
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(['movie', 'tv', 'episode']),
  rating: z.number().min(1).max(10),
  season: z.number().int().positive().optional(),
  episode: z.number().int().positive().optional(),
  title: z.string().optional(),
  posterPath: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.mediaType === 'episode' && (!data.season || !data.episode)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'season and episode are required for episode ratings',
      path: ['season'],
    });
  }
});

function ratingIdentity(userId, tmdbId, mediaType, season, episode) {
  const conditions = [
    eq(userRatings.userId, userId),
    eq(userRatings.tmdbId, tmdbId),
    eq(userRatings.mediaType, mediaType),
  ];

  if (season === undefined || season === null) conditions.push(isNull(userRatings.season));
  else conditions.push(eq(userRatings.season, Number(season)));

  if (episode === undefined || episode === null) conditions.push(isNull(userRatings.episode));
  else conditions.push(eq(userRatings.episode, Number(episode)));

  return and(...conditions);
}

export default async function ratingsRoutes(fastify) {
  fastify.addHook('preHandler', fastify.requireAuth);

  // GET /ratings — Todos los ratings del usuario
  fastify.get('/', async (req, reply) => {
    const { type, page = 1, limit = 100 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const conditions = [eq(userRatings.userId, req.user.id)];
    if (type) conditions.push(eq(userRatings.mediaType, type));

    const items = await db
      .select()
      .from(userRatings)
      .where(and(...conditions))
      .orderBy(desc(userRatings.ratedAt))
      .limit(Number(limit))
      .offset(offset);

    return reply.send({ results: items, page: Number(page) });
  });

  // POST /ratings — Dar o actualizar rating
  fastify.post('/', async (req, reply) => {
    const parsed = ratingSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', issues: parsed.error.issues });
    }

    const { tmdbId, mediaType, rating, season, episode, title, posterPath } = parsed.data;

    const [existing] = await db
      .select({ id: userRatings.id })
      .from(userRatings)
      .where(ratingIdentity(req.user.id, tmdbId, mediaType, season, episode))
      .limit(1);

    const values = {
      userId: req.user.id,
      tmdbId,
      mediaType,
      rating,
      season: season || null,
      episode: episode || null,
      title: title || null,
      posterPath: posterPath || null,
      updatedAt: new Date(),
    };

    const [item] = existing
      ? await db
          .update(userRatings)
          .set(values)
          .where(eq(userRatings.id, existing.id))
          .returning()
      : await db
          .insert(userRatings)
          .values(values)
          .returning();

    return reply.status(201).send({ item });
  });

  // DELETE /ratings/:tmdbId/:mediaType — Quitar rating
  fastify.delete('/:tmdbId/:mediaType', async (req, reply) => {
    const tmdbId = Number(req.params.tmdbId);
    const { mediaType } = req.params;
    const { season, episode } = req.query;

    if (!['movie', 'tv', 'episode'].includes(mediaType) || Number.isNaN(tmdbId)) {
      return reply.status(400).send({ error: 'Invalid rating identity' });
    }

    if (mediaType === 'episode' && (!season || !episode)) {
      return reply.status(400).send({ error: 'season and episode are required for episode ratings' });
    }

    await db
      .delete(userRatings)
      .where(ratingIdentity(req.user.id, tmdbId, mediaType, season, episode));
    return reply.send({ ok: true });
  });
}
