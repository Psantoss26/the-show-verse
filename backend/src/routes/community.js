// backend/src/routes/community.js
import { z } from 'zod';
import { ensureSeeded } from '../community/seed.js';
import {
  getCommentsPage, getSentiment, getListsForTitle, discoverLists, getCommunityListWithItems,
  insertNativeComment, updateNativeComment, deleteNativeComment,
  likeComment, unlikeComment, likeCommunityList, unlikeCommunityList,
  getCommentOwnerId, getCommunityListOwnerId,
} from '../community/store.js';
import { db } from '../db/client.js';
import { invalidateLevelState } from '../level/store.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TYPES = new Set(['movie', 'tv']);
function parseTarget(req, reply) {
  const type = String(req.params.type || '').toLowerCase();
  const tmdbId = Number(req.params.tmdbId);
  if (!TYPES.has(type) || !Number.isFinite(tmdbId)) {
    reply.status(400).send({ error: 'Invalid type or tmdbId' });
    return null;
  }
  return { type, tmdbId };
}

const commentBody = z.object({ comment: z.string().min(1).max(2000), spoiler: z.boolean().optional().default(false) });

// Con sesión, la respuesta lleva el `liked` de ESTE visitante: no puede quedarse
// en una caché compartida o un usuario vería los corazones de otro. Sin sesión la
// respuesta es idéntica para todos y se sigue pudiendo cachear como antes.
function setCommunityCache(reply, viewerId, publicValue) {
  reply.header('Cache-Control', viewerId ? 'private, no-store' : publicValue);
}

export default async function communityRoutes(fastify) {
  // GET comments — public; triggers seed if needed.
  fastify.get('/:type/:tmdbId/comments', async (req, reply) => {
    const t = parseTarget(req, reply); if (!t) return;
    const { tab = 'top', page = '1', limit = '5' } = req.query || {};
    const viewerId = req.user?.id || null;
    const seed = await ensureSeeded({ tmdbId: t.tmdbId, mediaType: t.type });
    const data = await getCommentsPage({ tmdbId: t.tmdbId, mediaType: t.type, tab, page, limit, viewerId });
    setCommunityCache(reply, viewerId, 'public, s-maxage=60, stale-while-revalidate=600');
    return { ...data, state: seed.status };
  });

  // GET sentiment — public; triggers seed.
  fastify.get('/:type/:tmdbId/sentiment', async (req, reply) => {
    const t = parseTarget(req, reply); if (!t) return;
    const seed = await ensureSeeded({ tmdbId: t.tmdbId, mediaType: t.type });
    const data = await getSentiment({ tmdbId: t.tmdbId, mediaType: t.type });
    reply.header('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
    return { ...data, state: seed.status };
  });

  // POST native comment — requires auth.
  fastify.post('/:type/:tmdbId/comments', { preHandler: fastify.requireAuth }, async (req, reply) => {
    const t = parseTarget(req, reply); if (!t) return;
    const parsed = commentBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Validation error', issues: parsed.error.issues });
    const item = await insertNativeComment({
      tmdbId: t.tmdbId, mediaType: t.type, userId: req.user.id, author: req.user,
      body: parsed.data.comment, spoiler: parsed.data.spoiler,
    });
    return reply.status(201).send({ comment: item });
  });

  // PATCH native comment (owner only).
  fastify.patch('/:type/:tmdbId/comments/:id', { preHandler: fastify.requireAuth }, async (req, reply) => {
    if (!UUID_RE.test(req.params.id)) return reply.status(404).send({ error: 'Comment not found' });
    const t = parseTarget(req, reply); if (!t) return;
    const parsed = commentBody.partial().safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Validation error', issues: parsed.error.issues });
    const item = await updateNativeComment({
      id: req.params.id, userId: req.user.id,
      body: parsed.data.comment, spoiler: parsed.data.spoiler,
    });
    if (!item) return reply.status(404).send({ error: 'Comment not found' });
    return reply.send({ comment: item });
  });

  // DELETE native comment (owner only).
  fastify.delete('/:type/:tmdbId/comments/:id', { preHandler: fastify.requireAuth }, async (req, reply) => {
    if (!UUID_RE.test(req.params.id)) return reply.status(404).send({ error: 'Comment not found' });
    const t = parseTarget(req, reply); if (!t) return;
    const ok = await deleteNativeComment({ id: req.params.id, userId: req.user.id });
    if (!ok) return reply.status(404).send({ error: 'Comment not found' });
    return reply.send({ ok: true });
  });

  // ── ME GUSTA en reseñas ──────────────────────
  // Idempotentes: repetir la llamada devuelve el mismo estado sin inflar el
  // contador. El XP de quien la escribió y de quien la valora quedan invalidados
  // para que el nivel se vea al momento.
  async function toggleCommentLike(req, reply, action) {
    if (!UUID_RE.test(req.params.id)) return reply.status(404).send({ error: 'Comment not found' });
    if (!parseTarget(req, reply)) return undefined;
    const result = await action({ commentId: req.params.id, userId: req.user.id });
    if (!result) return reply.status(404).send({ error: 'Comment not found' });

    // El nivel de quien da el me gusta lo invalida el hook global; aquí solo hace
    // falta el de quien lo RECIBE, que el hook no puede conocer.
    const ownerId = await getCommentOwnerId(req.params.id);
    if (ownerId && ownerId !== req.user.id) await invalidateLevelState(db, ownerId);
    return reply.send(result);
  }

  fastify.post('/:type/:tmdbId/comments/:id/like', { preHandler: fastify.requireAuth }, (req, reply) =>
    toggleCommentLike(req, reply, likeComment));

  fastify.delete('/:type/:tmdbId/comments/:id/like', { preHandler: fastify.requireAuth }, (req, reply) =>
    toggleCommentLike(req, reply, unlikeComment));

  // ── ME GUSTA en listas de la comunidad ───────
  async function toggleListLike(req, reply, action) {
    if (!UUID_RE.test(req.params.id)) return reply.status(404).send({ error: 'List not found' });
    const result = await action({ listId: req.params.id, userId: req.user.id });
    if (!result) return reply.status(404).send({ error: 'List not found' });

    // Las listas importadas de Trakt no tienen dueño en nuestra base de datos.
    const ownerId = await getCommunityListOwnerId(req.params.id);
    if (ownerId && ownerId !== req.user.id) await invalidateLevelState(db, ownerId);
    return reply.send(result);
  }

  fastify.post('/lists/:id/like', { preHandler: fastify.requireAuth }, (req, reply) =>
    toggleListLike(req, reply, likeCommunityList));

  fastify.delete('/lists/:id/like', { preHandler: fastify.requireAuth }, (req, reply) =>
    toggleListLike(req, reply, unlikeCommunityList));

  // Combined summary for SSR (one round-trip).
  fastify.get('/:type/:tmdbId/summary', async (req, reply) => {
    const t = parseTarget(req, reply); if (!t) return;
    const viewerId = req.user?.id || null;
    const seed = await ensureSeeded({ tmdbId: t.tmdbId, mediaType: t.type });
    const [sentiment, comments, lists] = await Promise.all([
      getSentiment({ tmdbId: t.tmdbId, mediaType: t.type }),
      getCommentsPage({ tmdbId: t.tmdbId, mediaType: t.type, tab: 'top', page: 1, limit: 5, viewerId }),
      getListsForTitle({ tmdbId: t.tmdbId, mediaType: t.type, limit: 6, viewerId }),
    ]);
    setCommunityCache(reply, viewerId, 'public, s-maxage=60, stale-while-revalidate=600');
    return { sentiment, comments, lists: { items: lists }, state: seed.status };
  });

  // Surface B: lists containing this title.
  fastify.get('/:type/:tmdbId/lists', async (req, reply) => {
    const t = parseTarget(req, reply); if (!t) return;
    const viewerId = req.user?.id || null;
    const seed = await ensureSeeded({ tmdbId: t.tmdbId, mediaType: t.type });
    const items = await getListsForTitle({ tmdbId: t.tmdbId, mediaType: t.type, limit: req.query?.limit || 6, viewerId });
    setCommunityCache(reply, viewerId, 'public, s-maxage=300, stale-while-revalidate=86400');
    return { items, state: seed.status };
  });

  // Surface A: discover.
  fastify.get('/lists/discover', async (req, reply) => {
    const { sort = 'items_desc', page = '1', limit = '30' } = req.query || {};
    const viewerId = req.user?.id || null;
    const results = await discoverLists({ sort, page, limit, viewerId });
    setCommunityCache(reply, viewerId, 'public, s-maxage=300, stale-while-revalidate=86400');
    return { results };
  });

  // List detail.
  fastify.get('/lists/:id', async (req, reply) => {
    if (!UUID_RE.test(req.params.id)) return reply.status(404).send({ error: 'List not found' });
    const { page = '1', limit = '50' } = req.query || {};
    const viewerId = req.user?.id || null;
    const data = await getCommunityListWithItems({ id: req.params.id, page, limit, viewerId });
    if (!data) return reply.status(404).send({ error: 'List not found' });
    setCommunityCache(reply, viewerId, 'public, s-maxage=300');
    return data;
  });
}
