// src/routes/progress.js
// Progreso de reproducción en curso ("Continuar viendo"). Las escrituras llegan
// por token revocable (POST /auth/netflix/progress); aquí solo se LEE con sesión
// para pintar la fila "Continuar viendo" y se permite descartar una entrada.

import { z } from 'zod';
import { db } from '../db/client.js';
import { watchProgress } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';

const manualProgressSchema = z.object({
  tmdbId: z.coerce.number().int().positive(),
  mediaType: z.enum(['movie', 'tv']),
  title: z.string().trim().min(1).max(300),
  posterPath: z.string().trim().max(500).nullable().optional(),
});

function toProgressResult(row) {
  return {
    id: row.id,
    tmdbId: row.tmdbId,
    mediaType: row.mediaType,
    season: row.season || null,
    episode: row.episode || null,
    positionSeconds: row.positionSeconds,
    runtimeSeconds: row.runtimeSeconds,
    percent: row.percent,
    platform: row.platform,
    title: row.title,
    posterPath: row.posterPath,
    updatedAt: row.updatedAt,
  };
}

export default async function progressRoutes(fastify) {
  fastify.addHook('preHandler', fastify.requireAuth);

  // ──────────────────────────────────────────────
  // GET /progress — Contenido en curso del usuario (más reciente primero)
  // ──────────────────────────────────────────────
  fastify.get('/', async (req, reply) => {
    const rows = await db
      .select()
      .from(watchProgress)
      .where(eq(watchProgress.userId, req.user.id))
      .orderBy(desc(watchProgress.updatedAt))
      .limit(50);

    const results = rows.map(toProgressResult);

    return reply.send({ results });
  });

  // ──────────────────────────────────────────────
  // POST /progress — Añadir manualmente un título a "Continuar viendo".
  // El progreso empieza en 0. Si la misma película/serie ya existe, conserva su
  // posición y solo actualiza sus metadatos + fecha para llevarla al principio.
  // ──────────────────────────────────────────────
  fastify.post('/', async (req, reply) => {
    const parsed = manualProgressSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation error',
        issues: parsed.error.issues,
      });
    }

    const { tmdbId, mediaType, title, posterPath } = parsed.data;
    const now = new Date();
    const conflictUpdate = {
      title,
      updatedAt: now,
      ...(posterPath ? { posterPath } : {}),
    };
    const [item] = await db
      .insert(watchProgress)
      .values({
        userId: req.user.id,
        tmdbId,
        mediaType,
        season: 0,
        episode: 0,
        positionSeconds: 0,
        runtimeSeconds: 0,
        percent: 0,
        platform: null,
        title,
        posterPath: posterPath || null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          watchProgress.userId,
          watchProgress.tmdbId,
          watchProgress.mediaType,
          watchProgress.season,
          watchProgress.episode,
        ],
        set: conflictUpdate,
      })
      .returning();

    return reply.status(201).send({
      ok: true,
      item: toProgressResult(item),
    });
  });

  // ──────────────────────────────────────────────
  // DELETE /progress/:id — Descartar una entrada de "Continuar viendo"
  // ──────────────────────────────────────────────
  fastify.delete('/:id', async (req, reply) => {
    const parsed = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid id' });
    }

    const deleted = await db
      .delete(watchProgress)
      .where(and(
        eq(watchProgress.id, parsed.data.id),
        eq(watchProgress.userId, req.user.id),
      ))
      .returning({ id: watchProgress.id });

    if (!deleted.length) return reply.status(404).send({ error: 'Not found' });
    return reply.send({ ok: true });
  });
}
