// src/routes/progress.js
// Progreso de reproducción en curso ("Continuar viendo"). Las escrituras llegan
// por token revocable (POST /auth/netflix/progress); aquí solo se LEE con sesión
// para pintar la fila "Continuar viendo" y se permite descartar una entrada.

import { z } from 'zod';
import { db } from '../db/client.js';
import { watchProgress } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';

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

    const results = rows.map((r) => ({
      id: r.id,
      tmdbId: r.tmdbId,
      mediaType: r.mediaType,
      season: r.season || null,
      episode: r.episode || null,
      positionSeconds: r.positionSeconds,
      runtimeSeconds: r.runtimeSeconds,
      percent: r.percent,
      platform: r.platform,
      title: r.title,
      posterPath: r.posterPath,
      updatedAt: r.updatedAt,
    }));

    return reply.send({ results });
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
