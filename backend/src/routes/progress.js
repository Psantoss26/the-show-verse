// src/routes/progress.js
// Progreso de reproducción en curso ("Continuar viendo"). Las escrituras llegan
// por token revocable (POST /auth/netflix/progress); aquí solo se LEE con sesión
// para pintar la fila "Continuar viendo" y se permite descartar una entrada.

import { z } from 'zod';
import { db } from '../db/client.js';
import { watchProgress } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { getRuntimeSeconds } from '../lib/tmdbRuntime.js';

// Plataformas que se pueden elegir al añadir a mano: los mismos ids cortos que
// guardan la extensión y la app Android en el progreso automático.
export const MANUAL_PROGRESS_PLATFORMS = [
  'netflix', 'primevideo', 'max', 'disney', 'appletv', 'movistar',
  'crunchyroll', 'plex',
];

// Por debajo del 90%: a partir de ahí el progreso automático ya lo da por visto
// y lo saca de "Continuar viendo", así que una fila manual no debe superarlo.
const MANUAL_MAX_PERCENT = 0.89;

const manualProgressSchema = z.object({
  tmdbId: z.coerce.number().int().positive(),
  mediaType: z.enum(['movie', 'tv']),
  title: z.string().trim().min(1).max(300),
  posterPath: z.string().trim().max(500).nullable().optional(),
  // Opcionales (progreso inicial, como las entradas automáticas). 0..1.
  percent: z.coerce.number().min(0).max(MANUAL_MAX_PERCENT).optional(),
  platform: z.enum(MANUAL_PROGRESS_PLATFORMS).nullable().optional(),
  // Solo series: episodio concreto (ambos o ninguno).
  season: z.coerce.number().int().min(1).max(1000).optional(),
  episode: z.coerce.number().int().min(1).max(10000).optional(),
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
  // Admite, igual que las entradas automáticas, un progreso inicial (`percent`),
  // la plataforma y —en series— el episodio. Sin `percent` empieza en 0 y, si la
  // misma entrada ya existe, conserva su posición y solo actualiza metadatos +
  // fecha para llevarla al principio.
  // ──────────────────────────────────────────────
  fastify.post('/', async (req, reply) => {
    const parsed = manualProgressSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation error',
        issues: parsed.error.issues,
      });
    }

    const { tmdbId, mediaType, title, posterPath, platform } = parsed.data;
    const isTv = mediaType === 'tv';
    const hasEpisode =
      isTv && parsed.data.season != null && parsed.data.episode != null;
    if (isTv && !hasEpisode && (parsed.data.season != null || parsed.data.episode != null)) {
      return reply.status(400).send({ error: 'season and episode must be provided together' });
    }
    const season = hasEpisode ? parsed.data.season : 0;
    const episode = hasEpisode ? parsed.data.episode : 0;
    const hasPercent = parsed.data.percent != null;
    const percent = hasPercent ? parsed.data.percent : 0;

    // Con progreso, la duración (TMDb) permite guardar también la posición, así
    // la tarjeta muestra "Quedan X min" como las entradas automáticas.
    const runtimeSeconds = hasPercent
      ? await getRuntimeSeconds({ tmdbId, mediaType, season, episode })
      : 0;
    const positionSeconds = Math.round(runtimeSeconds * percent);

    const now = new Date();
    const conflictUpdate = {
      title,
      updatedAt: now,
      ...(posterPath ? { posterPath } : {}),
      ...(hasPercent ? { percent, positionSeconds, runtimeSeconds } : {}),
      ...(platform !== undefined ? { platform } : {}),
    };
    const [item] = await db
      .insert(watchProgress)
      .values({
        userId: req.user.id,
        tmdbId,
        mediaType,
        season,
        episode,
        positionSeconds,
        runtimeSeconds,
        percent,
        platform: platform || null,
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
