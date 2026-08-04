// src/routes/recommendations.js
// Baraja de la sección de Recomendaciones (flujo de deslizar) y persistencia de
// los títulos descartados.
//
// Los descartes se guardan en la base de datos y no en el navegador porque son
// una decisión sobre el catálogo del usuario, no una preferencia de la sesión:
// descartar algo en el móvil debe valer también en el ordenador.
//
// El filtrado se hace AQUÍ y no en el cliente a propósito: el cliente pide una
// baraja y recibe solo lo que puede deslizar. Así no necesita cruzar la lista de
// recomendaciones con descartes/pendientes/favoritos en cada recarga, y no hay
// dos sitios que puedan discrepar sobre qué es "una carta válida".

import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  favorites,
  recommendationDismissals,
  watchlist,
} from '../db/schema.js';
import { getUserRecommendations } from '../dashboard/recommendations.js';

const dismissSchema = z.object({
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(['movie', 'tv']),
});

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;

function clampLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(n)));
}

function cardKey(mediaType, tmdbId) {
  return `${mediaType}:${tmdbId}`;
}

// Intercala películas y series para que la baraja no salgan primero todas las
// películas y luego todas las series.
function interleave(a, b) {
  const out = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    if (i < a.length) out.push(a[i]);
    if (i < b.length) out.push(b[i]);
  }
  return out;
}

export default async function recommendationsRoutes(fastify) {
  fastify.addHook('preHandler', fastify.requireAuth);

  // GET /recommendations?type=all|movie|tv&limit=40
  // Baraja lista para deslizar: recomendaciones personales del usuario menos lo
  // descartado y menos lo que ya está en pendientes o favoritos (deslizarlo otra
  // vez no aportaría nada).
  fastify.get('/', async (req) => {
    const userId = req.user.id;
    const type = req.query?.type === 'movie' || req.query?.type === 'tv'
      ? req.query.type
      : 'all';
    const limit = clampLimit(req.query?.limit);

    const mediaTypes = type === 'all' ? ['movie', 'tv'] : [type];

    const [recsByType, dismissedRows, watchlistRows, favoriteRows] =
      await Promise.all([
        Promise.all(
          mediaTypes.map((mt) =>
            getUserRecommendations(userId, mt).catch(() => []),
          ),
        ),
        db
          .select({
            tmdbId: recommendationDismissals.tmdbId,
            mediaType: recommendationDismissals.mediaType,
          })
          .from(recommendationDismissals)
          .where(eq(recommendationDismissals.userId, userId)),
        db
          .select({ tmdbId: watchlist.tmdbId, mediaType: watchlist.mediaType })
          .from(watchlist)
          .where(eq(watchlist.userId, userId)),
        db
          .select({ tmdbId: favorites.tmdbId, mediaType: favorites.mediaType })
          .from(favorites)
          .where(eq(favorites.userId, userId)),
      ]);

    const excluded = new Set();
    for (const rows of [dismissedRows, watchlistRows, favoriteRows]) {
      for (const row of rows) excluded.add(cardKey(row.mediaType, row.tmdbId));
    }

    const [first = [], second = []] = recsByType;
    const ordered = mediaTypes.length === 2 ? interleave(first, second) : first;

    const seen = new Set();
    const items = [];
    for (const item of ordered) {
      if (!item?.tmdbId || !item?.mediaType) continue;
      const key = cardKey(item.mediaType, item.tmdbId);
      if (excluded.has(key) || seen.has(key)) continue;
      seen.add(key);
      items.push(item);
      if (items.length >= limit) break;
    }

    return { items, total: items.length };
  });

  // POST /recommendations/dismiss
  // Idempotente: descartar dos veces el mismo título no duplica filas ni falla,
  // porque el cliente puede reintentar tras un fallo de red.
  fastify.post('/dismiss', async (req, reply) => {
    const parsed = dismissSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Datos de descarte inválidos' });
    }
    const { tmdbId, mediaType } = parsed.data;

    await db
      .insert(recommendationDismissals)
      .values({ userId: req.user.id, tmdbId, mediaType })
      .onConflictDoNothing({
        target: [
          recommendationDismissals.userId,
          recommendationDismissals.tmdbId,
          recommendationDismissals.mediaType,
        ],
      });

    return { ok: true };
  });

  // DELETE /recommendations/dismiss/:mediaType/:tmdbId
  // Deshacer un descarte (el botón de deshacer de la baraja).
  fastify.delete('/dismiss/:mediaType/:tmdbId', async (req, reply) => {
    const parsed = dismissSchema.safeParse({
      tmdbId: Number(req.params?.tmdbId),
      mediaType: req.params?.mediaType,
    });
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Datos de descarte inválidos' });
    }
    const { tmdbId, mediaType } = parsed.data;

    await db
      .delete(recommendationDismissals)
      .where(
        and(
          eq(recommendationDismissals.userId, req.user.id),
          eq(recommendationDismissals.tmdbId, tmdbId),
          eq(recommendationDismissals.mediaType, mediaType),
        ),
      );

    return { ok: true };
  });

  // GET /recommendations/dismissed
  // Títulos descartados, del más reciente al más antiguo. Alimenta una posible
  // vista de "descartados" y permite comprobar el estado desde el cliente.
  fastify.get('/dismissed', async (req) => {
    const limit = clampLimit(req.query?.limit);
    const rows = await db
      .select({
        tmdbId: recommendationDismissals.tmdbId,
        mediaType: recommendationDismissals.mediaType,
        dismissedAt: recommendationDismissals.dismissedAt,
      })
      .from(recommendationDismissals)
      .where(eq(recommendationDismissals.userId, req.user.id))
      .orderBy(desc(recommendationDismissals.dismissedAt))
      .limit(limit);

    return { items: rows, total: rows.length };
  });
}
