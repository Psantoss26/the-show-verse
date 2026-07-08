// backend/src/routes/community.js
import { z } from 'zod';
import { ensureSeeded, getState } from '../community/seed.js';
import {
  getCommentsPage, insertNativeComment, updateNativeComment, deleteNativeComment,
} from '../community/store.js';

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

export default async function communityRoutes(fastify) {
  // GET comments — public; triggers seed if needed.
  fastify.get('/:type/:tmdbId/comments', async (req, reply) => {
    const t = parseTarget(req, reply); if (!t) return;
    const { tab = 'top', page = '1', limit = '5' } = req.query || {};
    const seed = await ensureSeeded({ tmdbId: t.tmdbId, mediaType: t.type });
    const data = await getCommentsPage({ tmdbId: t.tmdbId, mediaType: t.type, tab, page, limit });
    reply.header('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');
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
    const t = parseTarget(req, reply); if (!t) return;
    const parsed = commentBody.partial().safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Validation error', issues: parsed.error.issues });
    const item = await updateNativeComment({
      id: req.params.id, userId: req.user.id,
      body: parsed.data.comment, spoiler: parsed.data.spoiler ?? false,
    });
    if (!item) return reply.status(404).send({ error: 'Comment not found' });
    return reply.send({ comment: item });
  });

  // DELETE native comment (owner only).
  fastify.delete('/:type/:tmdbId/comments/:id', { preHandler: fastify.requireAuth }, async (req, reply) => {
    const t = parseTarget(req, reply); if (!t) return;
    const ok = await deleteNativeComment({ id: req.params.id, userId: req.user.id });
    if (!ok) return reply.status(404).send({ error: 'Comment not found' });
    return reply.send({ ok: true });
  });
}
