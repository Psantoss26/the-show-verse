// src/routes/history.js
// Historial de visionado: películas, series y episodios

import { z } from 'zod';
import { db } from '../db/client.js';
import { watchHistory } from '../db/schema.js';
import { eq, and, desc, gte, lte, inArray, isNotNull } from 'drizzle-orm';

const addHistorySchema = z.object({
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(['movie', 'tv']),
  season: z.number().int().positive().optional(),
  episode: z.number().int().positive().optional(),
  watchedAt: z.string().datetime().optional(),
  runtimeMins: z.number().int().positive().optional(),
  title: z.string().optional(),
  posterPath: z.string().optional(),
});

function clampPageLimit(value, { fallback = 100, max = 2000 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, Math.floor(n));
}

function buildWatchedBySeason(rows) {
  const watchedBySeason = {};
  for (const ep of rows) {
    const key = String(ep.season);
    if (!watchedBySeason[key]) watchedBySeason[key] = [];
    if (ep.episode && !watchedBySeason[key].includes(ep.episode)) {
      watchedBySeason[key].push(ep.episode);
    }
  }
  return watchedBySeason;
}

export default async function historyRoutes(fastify) {
  fastify.addHook('preHandler', fastify.requireAuth);

  // ──────────────────────────────────────────────
  // GET /history — Historial paginado global
  // ──────────────────────────────────────────────
  fastify.get('/', async (req, reply) => {
    const { type, from, to, page = 1, limit = 50 } = req.query;
    const safeLimit = clampPageLimit(limit);
    const safePage = Math.max(1, Math.floor(Number(page) || 1));
    const offset = (safePage - 1) * safeLimit;

    const conditions = [eq(watchHistory.userId, req.user.id)];
    if (type === 'movie' || type === 'tv') {
      conditions.push(eq(watchHistory.mediaType, type));
    }
    if (from) conditions.push(gte(watchHistory.watchedAt, new Date(from)));
    if (to) conditions.push(lte(watchHistory.watchedAt, new Date(to)));

    const items = await db
      .select()
      .from(watchHistory)
      .where(and(...conditions))
      .orderBy(desc(watchHistory.watchedAt))
      .limit(safeLimit)
      .offset(offset);

    return reply.send({ results: items, page: safePage, limit: safeLimit });
  });

  // ──────────────────────────────────────────────
  // POST /history — Añadir entrada al historial
  // ──────────────────────────────────────────────
  fastify.post('/', async (req, reply) => {
    const parsed = addHistorySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', issues: parsed.error.issues });
    }

    const { tmdbId, mediaType, season, episode, watchedAt, runtimeMins, title, posterPath } = parsed.data;

    const [item] = await db
      .insert(watchHistory)
      .values({
        userId: req.user.id,
        tmdbId,
        mediaType,
        season: season || null,
        episode: episode || null,
        watchedAt: watchedAt ? new Date(watchedAt) : new Date(),
        runtimeMins: runtimeMins || null,
        title: title || null,
        posterPath: posterPath || null,
      })
      .returning();

    return reply.status(201).send({ item });
  });

  // ──────────────────────────────────────────────
  // DELETE /history/:id — Eliminar entrada específica
  // ──────────────────────────────────────────────
  fastify.delete('/:id', async (req, reply) => {
    const { id } = req.params;

    const deleted = await db
      .delete(watchHistory)
      .where(
        and(
          eq(watchHistory.id, id),
          eq(watchHistory.userId, req.user.id) // seguridad: solo el propietario
        )
      )
      .returning({ id: watchHistory.id });

    if (!deleted.length) return reply.status(404).send({ error: 'Not found' });
    return reply.send({ ok: true });
  });

  // ──────────────────────────────────────────────
  // DELETE /history/bulk — Eliminar múltiples entradas
  // ──────────────────────────────────────────────
  fastify.delete('/bulk', async (req, reply) => {
    const parsed = z.object({
      ids: z.array(z.string().uuid()).min(1).max(1000),
    }).safeParse(req.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation error',
        issues: parsed.error.issues,
      });
    }

    // Eliminar en lotes de 100 para no saturar la BD
    let deleted = 0;
    const chunks = [];
    const { ids } = parsed.data;
    for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));

    for (const chunk of chunks) {
      const result = await db
        .delete(watchHistory)
        .where(
          and(
            eq(watchHistory.userId, req.user.id),
            inArray(watchHistory.id, chunk)
          )
        )
        .returning({ id: watchHistory.id });
      deleted += result.length;
    }

    return reply.send({ ok: true, deleted });
  });

  // ──────────────────────────────────────────────
  // GET /history/shows/:tmdbId — Episodios vistos (watchedBySeason)
  // Replica exacta de traktGetShowWatched
  // ──────────────────────────────────────────────
  fastify.get('/shows/:tmdbId', async (req, reply) => {
    const tmdbId = Number(req.params.tmdbId);

    const episodes = await db
      .select({
        season: watchHistory.season,
        episode: watchHistory.episode,
        watchedAt: watchHistory.watchedAt,
        id: watchHistory.id,
      })
      .from(watchHistory)
      .where(
        and(
          eq(watchHistory.userId, req.user.id),
          eq(watchHistory.tmdbId, tmdbId),
          eq(watchHistory.mediaType, 'tv'),
          isNotNull(watchHistory.season),
          isNotNull(watchHistory.episode)
        )
      )
      .orderBy(desc(watchHistory.watchedAt));

    // Construir watchedBySeason: { "1": [1, 2, 3], "2": [1] }
    const watchedBySeason = buildWatchedBySeason(episodes);

    return reply.send({
      connected: true,
      found: episodes.length > 0,
      watchedBySeason,
      episodes,
    });
  });

  // ──────────────────────────────────────────────
  // GET /history/movies/:tmdbId — Visionados de una película
  // Replica de traktGetMovieWatched
  // ──────────────────────────────────────────────
  fastify.get('/movies/:tmdbId', async (req, reply) => {
    const tmdbId = Number(req.params.tmdbId);

    const plays = await db
      .select({
        id: watchHistory.id,
        watchedAt: watchHistory.watchedAt,
      })
      .from(watchHistory)
      .where(
        and(
          eq(watchHistory.userId, req.user.id),
          eq(watchHistory.tmdbId, tmdbId),
          eq(watchHistory.mediaType, 'movie')
        )
      )
      .orderBy(desc(watchHistory.watchedAt));

    return reply.send({
      connected: true,
      found: plays.length > 0,
      watched: plays.length > 0,
      plays: plays.length,
      lastWatchedAt: plays[0]?.watchedAt || null,
      history: plays.map((p) => ({ id: p.id, watchedAt: p.watchedAt })),
    });
  });

  // ──────────────────────────────────────────────
  // GET /history/episodes/:tmdbId/:season/:episode
  // Replica de traktGetEpisodePlays
  // ──────────────────────────────────────────────
  fastify.get('/episodes/:tmdbId/:season/:episode', async (req, reply) => {
    const tmdbId = Number(req.params.tmdbId);
    const season = Number(req.params.season);
    const episode = Number(req.params.episode);

    const plays = await db
      .select({
        id: watchHistory.id,
        watchedAt: watchHistory.watchedAt,
      })
      .from(watchHistory)
      .where(
        and(
          eq(watchHistory.userId, req.user.id),
          eq(watchHistory.tmdbId, tmdbId),
          eq(watchHistory.mediaType, 'tv'),
          eq(watchHistory.season, season),
          eq(watchHistory.episode, episode)
        )
      )
      .orderBy(desc(watchHistory.watchedAt));

    return reply.send({
      connected: true,
      found: plays.length > 0,
      plays: plays.length,
      lastWatchedAt: plays[0]?.watchedAt || null,
      history: plays.map((p) => ({ id: p.id, watchedAt: p.watchedAt })),
    });
  });

  // ──────────────────────────────────────────────
  // POST /history/episodes — Marcar episodio visto/no visto
  // Replica de traktSetEpisodeWatched
  // ──────────────────────────────────────────────
  fastify.post('/episodes', async (req, reply) => {
    const schema = z.object({
      tmdbId: z.number().int().positive(),
      season: z.number().int().positive(),
      episode: z.number().int().positive(),
      watched: z.boolean(),
      watchedAt: z.string().optional(),
      title: z.string().optional(),
      posterPath: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', issues: parsed.error.issues });
    }

    const { tmdbId, season, episode, watched, watchedAt, title, posterPath } = parsed.data;

    if (watched) {
      const [existing] = await db
        .select({ id: watchHistory.id })
        .from(watchHistory)
        .where(
          and(
            eq(watchHistory.userId, req.user.id),
            eq(watchHistory.tmdbId, tmdbId),
            eq(watchHistory.mediaType, 'tv'),
            eq(watchHistory.season, season),
            eq(watchHistory.episode, episode)
          )
        )
        .limit(1);

      if (!existing) {
        await db
          .insert(watchHistory)
          .values({
            userId: req.user.id,
            tmdbId,
            mediaType: 'tv',
            season,
            episode,
            watchedAt: watchedAt ? new Date(watchedAt) : new Date(),
            title: title || null,
            posterPath: posterPath || null,
          });
      }
    } else {
      // Quitar del historial (todos los plays de este episodio)
      await db
        .delete(watchHistory)
        .where(
          and(
            eq(watchHistory.userId, req.user.id),
            eq(watchHistory.tmdbId, tmdbId),
            eq(watchHistory.mediaType, 'tv'),
            eq(watchHistory.season, season),
            eq(watchHistory.episode, episode)
          )
        );
    }

    // Devolver watchedBySeason actualizado (igual que Trakt)
    const allEpisodes = await db
      .select({ season: watchHistory.season, episode: watchHistory.episode })
      .from(watchHistory)
      .where(
        and(
          eq(watchHistory.userId, req.user.id),
          eq(watchHistory.tmdbId, tmdbId),
          eq(watchHistory.mediaType, 'tv'),
          isNotNull(watchHistory.season),
          isNotNull(watchHistory.episode)
        )
      );

    const watchedBySeason = buildWatchedBySeason(allEpisodes);

    return reply.send({ ok: true, watchedBySeason });
  });

  // ──────────────────────────────────────────────
  // POST /history/episodes/bulk — Añadir plays de episodios sin deduplicar
  // Usado para registrar un visionado completo o rewatch de una serie.
  // ──────────────────────────────────────────────
  fastify.post('/episodes/bulk', async (req, reply) => {
    const schema = z.object({
      tmdbId: z.number().int().positive(),
      watchedAt: z.string().optional(),
      title: z.string().optional(),
      posterPath: z.string().optional(),
      episodes: z.array(z.object({
        season: z.number().int().positive(),
        episode: z.number().int().positive(),
        title: z.string().optional(),
      })).min(1).max(1000),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', issues: parsed.error.issues });
    }

    const { tmdbId, watchedAt, title, posterPath, episodes } = parsed.data;
    const watchedAtDate = watchedAt ? new Date(watchedAt) : new Date();
    if (Number.isNaN(watchedAtDate.getTime())) {
      return reply.status(400).send({ error: 'Invalid watchedAt' });
    }

    const rows = episodes.map((ep) => ({
      userId: req.user.id,
      tmdbId,
      mediaType: 'tv',
      season: ep.season,
      episode: ep.episode,
      watchedAt: watchedAtDate,
      title: ep.title || title || null,
      posterPath: posterPath || null,
    }));

    const inserted = await db
      .insert(watchHistory)
      .values(rows)
      .returning({ id: watchHistory.id });

    return reply.status(201).send({
      ok: true,
      inserted: inserted.length,
      ids: inserted.map((row) => row.id),
    });
  });

  // ──────────────────────────────────────────────
  // POST /history/seasons — Marcar temporada completa
  // Replica de traktSetSeasonWatched
  // ──────────────────────────────────────────────
  fastify.post('/seasons', async (req, reply) => {
    const schema = z.object({
      tmdbId: z.number().int().positive(),
      season: z.number().int().min(0),
      watched: z.boolean(),
      watchedAt: z.string().optional(),
      // Lista de episodios a marcar (requerido para marcar como visto)
      episodes: z.array(z.object({
        episode: z.number().int().positive(),
        title: z.string().optional(),
      })).optional(),
      title: z.string().optional(),
      posterPath: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', issues: parsed.error.issues });
    }

    const { tmdbId, season, watched, watchedAt, episodes = [], title, posterPath } = parsed.data;

    if (watched && episodes.length > 0) {
      const requestedEpisodeNumbers = [...new Set(episodes.map((ep) => ep.episode))];
      const alreadyWatched = await db
        .select({ episode: watchHistory.episode })
        .from(watchHistory)
        .where(
          and(
            eq(watchHistory.userId, req.user.id),
            eq(watchHistory.tmdbId, tmdbId),
            eq(watchHistory.mediaType, 'tv'),
            eq(watchHistory.season, season),
            inArray(watchHistory.episode, requestedEpisodeNumbers)
          )
        );

      const watchedEpisodes = new Set(alreadyWatched.map((ep) => ep.episode));

      const values = episodes.map((ep) => ({
        userId: req.user.id,
        tmdbId,
        mediaType: 'tv',
        season,
        episode: ep.episode,
        watchedAt: watchedAt ? new Date(watchedAt) : new Date(),
        title: title || null,
        posterPath: posterPath || null,
      })).filter((ep) => !watchedEpisodes.has(ep.episode));

      if (values.length > 0) {
        await db.insert(watchHistory).values(values);
      }
    } else if (!watched) {
      // Quitar toda la temporada
      await db
        .delete(watchHistory)
        .where(
          and(
            eq(watchHistory.userId, req.user.id),
            eq(watchHistory.tmdbId, tmdbId),
            eq(watchHistory.mediaType, 'tv'),
            eq(watchHistory.season, season)
          )
        );
    }

    // Devolver watchedBySeason actualizado
    const allEpisodes = await db
      .select({ season: watchHistory.season, episode: watchHistory.episode })
      .from(watchHistory)
      .where(
        and(
          eq(watchHistory.userId, req.user.id),
          eq(watchHistory.tmdbId, tmdbId),
          eq(watchHistory.mediaType, 'tv'),
          isNotNull(watchHistory.season)
        )
      );

    const watchedBySeason = buildWatchedBySeason(allEpisodes);

    return reply.send({ ok: true, watchedBySeason });
  });
}
