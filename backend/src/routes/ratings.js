// src/routes/ratings.js
// Ratings de usuario (películas, series, temporadas, episodios)

import { z } from 'zod';
import { db } from '../db/client.js';
import { userRatings } from '../db/schema.js';
import { eq, and, desc, isNull } from 'drizzle-orm';
import {
  resolveEnglishPosterPaths,
  titleKey,
} from '../lib/userProfile.js';

const ratingSchema = z.object({
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(['movie', 'tv', 'season', 'episode']),
  rating: z.number().min(1).max(10),
  // TMDb identifica los especiales como temporada 0. SeasonDetails los
  // expone y permite puntuarlos, así que 0 es una identidad válida.
  season: z.number().int().nonnegative().optional(),
  episode: z.number().int().positive().optional(),
  title: z.string().optional(),
  posterPath: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.mediaType === 'episode' && (data.season == null || data.episode == null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'season and episode are required for episode ratings',
      path: ['season'],
    });
  }
  if (data.mediaType === 'season' && (data.season == null || data.episode != null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'season ratings require season and no episode',
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

function clampPageLimit(value, { fallback = 250, max = 2000 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, Math.floor(n));
}

export default async function ratingsRoutes(fastify) {
  fastify.addHook('preHandler', fastify.requireAuth);

  // GET /ratings — Todos los ratings del usuario
  fastify.get('/', async (req, reply) => {
    const { type, page = 1, limit = 100 } = req.query;
    const safeLimit = clampPageLimit(limit);
    const safePage = Math.max(1, Math.floor(Number(page) || 1));
    const offset = (safePage - 1) * safeLimit;

    const conditions = [eq(userRatings.userId, req.user.id)];
    if (type) conditions.push(eq(userRatings.mediaType, type));

    const items = await db
      .select()
      .from(userRatings)
      .where(and(...conditions))
      .orderBy(desc(userRatings.ratedAt))
      .limit(safeLimit)
      .offset(offset);

    return reply.send({ results: items, page: safePage, limit: safeLimit });
  });

  // POST /ratings — Dar o actualizar rating
  fastify.post('/', async (req, reply) => {
    const parsed = ratingSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', issues: parsed.error.issues });
    }

    const { tmdbId, mediaType, rating, season, episode, title, posterPath } = parsed.data;
    const isProfileTitleRating =
      (mediaType === 'movie' || mediaType === 'tv') &&
      season == null &&
      episode == null;
    const resolvedPosters = isProfileTitleRating
      ? await resolveEnglishPosterPaths(db, [{ tmdbId, mediaType }])
      : new Map();
    const posterKey = titleKey(mediaType, tmdbId);
    const hasEnglishPosterDecision =
      isProfileTitleRating && resolvedPosters.has(posterKey);
    const storedPosterPath = isProfileTitleRating
      ? (resolvedPosters.get(posterKey) || null)
      : (posterPath || null);

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
      // No usar `||`: la temporada 0 es "Especiales" en TMDb y debe
      // conservarse como parte de la identidad de la valoración.
      season: season ?? null,
      episode: episode ?? null,
      title: title || null,
      posterPath: storedPosterPath,
      // La actividad se ordena por ratedAt. Al cambiar una nota existente debe
      // volver a ser actividad reciente, igual que una valoración nueva.
      ratedAt: new Date(),
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

    return reply.status(201).send({
      item: {
        ...item,
        posterPath: isProfileTitleRating
          ? (hasEnglishPosterDecision ? storedPosterPath : null)
          : item.posterPath,
      },
    });
  });

  // DELETE /ratings/:tmdbId/:mediaType — Quitar rating
  fastify.delete('/:tmdbId/:mediaType', async (req, reply) => {
    const tmdbId = Number(req.params.tmdbId);
    const { mediaType } = req.params;
    const { season, episode } = req.query;
    const seasonNumber = season == null ? null : Number(season);
    const episodeNumber = episode == null ? null : Number(episode);
    const hasValidSeason = Number.isInteger(seasonNumber) && seasonNumber >= 0;
    const hasValidEpisode = Number.isInteger(episodeNumber) && episodeNumber > 0;

    if (!['movie', 'tv', 'season', 'episode'].includes(mediaType) || Number.isNaN(tmdbId)) {
      return reply.status(400).send({ error: 'Invalid rating identity' });
    }

    if (mediaType === 'episode' && (!hasValidSeason || !hasValidEpisode)) {
      return reply.status(400).send({ error: 'season and episode are required for episode ratings' });
    }
    if (mediaType === 'season' && (!hasValidSeason || episode != null)) {
      return reply.status(400).send({ error: 'season is required and episode is not allowed for season ratings' });
    }

    await db
      .delete(userRatings)
      .where(ratingIdentity(req.user.id, tmdbId, mediaType, seasonNumber, episodeNumber));
    return reply.send({ ok: true });
  });
}
