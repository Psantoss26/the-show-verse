// src/routes/lists.js
// Listas personalizadas de usuario

import { z } from 'zod';
import { db } from '../db/client.js';
import { userLists, userListItems } from '../db/schema.js';
import { eq, and, asc, desc } from 'drizzle-orm';

const listSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().optional().default(false),
  sortBy: z.enum(['added_at', 'title', 'position']).optional().default('added_at'),
});

const listItemSchema = z.object({
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(['movie', 'tv']),
  title: z.string().optional(),
  posterPath: z.string().optional(),
  position: z.number().int().min(0).optional(),
});

export default async function listsRoutes(fastify) {
  fastify.addHook('preHandler', fastify.requireAuth);

  // GET /lists — Listas del usuario
  fastify.get('/', async (req, reply) => {
    const lists = await db
      .select()
      .from(userLists)
      .where(eq(userLists.userId, req.user.id))
      .orderBy(desc(userLists.updatedAt));

    return reply.send({ results: lists });
  });

  // POST /lists — Crear lista
  fastify.post('/', async (req, reply) => {
    const parsed = listSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', issues: parsed.error.issues });
    }

    const [list] = await db
      .insert(userLists)
      .values({ userId: req.user.id, ...parsed.data })
      .returning();

    return reply.status(201).send({ list });
  });

  // GET /lists/:id — Detalle de una lista con items
  fastify.get('/:id', async (req, reply) => {
    const [list] = await db
      .select()
      .from(userLists)
      .where(and(eq(userLists.id, req.params.id), eq(userLists.userId, req.user.id)))
      .limit(1);

    if (!list) return reply.status(404).send({ error: 'List not found' });

    const items = await db
      .select()
      .from(userListItems)
      .where(eq(userListItems.listId, list.id))
      .orderBy(asc(userListItems.position), desc(userListItems.addedAt));

    return reply.send({ list, items });
  });

  // PATCH /lists/:id — Editar lista
  fastify.patch('/:id', async (req, reply) => {
    const parsed = listSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', issues: parsed.error.issues });
    }

    const [list] = await db
      .update(userLists)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(userLists.id, req.params.id), eq(userLists.userId, req.user.id)))
      .returning();

    if (!list) return reply.status(404).send({ error: 'List not found' });
    return reply.send({ list });
  });

  // DELETE /lists/:id — Eliminar lista
  fastify.delete('/:id', async (req, reply) => {
    await db
      .delete(userLists)
      .where(and(eq(userLists.id, req.params.id), eq(userLists.userId, req.user.id)));
    return reply.send({ ok: true });
  });

  // POST /lists/:id/items — Añadir item a lista
  fastify.post('/:id/items', async (req, reply) => {
    const [list] = await db
      .select({ id: userLists.id })
      .from(userLists)
      .where(and(eq(userLists.id, req.params.id), eq(userLists.userId, req.user.id)))
      .limit(1);

    if (!list) return reply.status(404).send({ error: 'List not found' });

    const parsed = listItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', issues: parsed.error.issues });
    }

    const { tmdbId, mediaType, title, posterPath, position = 0 } = parsed.data;

    const [item] = await db
      .insert(userListItems)
      .values({ listId: list.id, tmdbId, mediaType, title, posterPath, position })
      .onConflictDoUpdate({
        target: [userListItems.listId, userListItems.tmdbId, userListItems.mediaType],
        set: { position, addedAt: new Date() },
      })
      .returning();

    // Actualizar updatedAt de la lista
    await db.update(userLists).set({ updatedAt: new Date() }).where(eq(userLists.id, list.id));

    return reply.status(201).send({ item });
  });

  // DELETE /lists/:id/items/:tmdbId/:mediaType — Quitar item de lista
  fastify.delete('/:id/items/:tmdbId/:mediaType', async (req, reply) => {
    const tmdbId = Number(req.params.tmdbId);
    const { mediaType, id } = req.params;

    // Verificar que la lista es del usuario
    const [list] = await db
      .select({ id: userLists.id })
      .from(userLists)
      .where(and(eq(userLists.id, id), eq(userLists.userId, req.user.id)))
      .limit(1);

    if (!list) return reply.status(404).send({ error: 'List not found' });

    await db
      .delete(userListItems)
      .where(
        and(
          eq(userListItems.listId, list.id),
          eq(userListItems.tmdbId, tmdbId),
          eq(userListItems.mediaType, mediaType)
        )
      );

    await db.update(userLists).set({ updatedAt: new Date() }).where(eq(userLists.id, list.id));
    return reply.send({ ok: true });
  });

  // PATCH /lists/:id/items/reorder — Reordenar items
  fastify.patch('/:id/items/reorder', async (req, reply) => {
    const { items } = req.body || {};
    if (!Array.isArray(items)) {
      return reply.status(400).send({ error: 'items array required' });
    }

    const [list] = await db
      .select({ id: userLists.id })
      .from(userLists)
      .where(and(eq(userLists.id, req.params.id), eq(userLists.userId, req.user.id)))
      .limit(1);

    if (!list) return reply.status(404).send({ error: 'List not found' });

    // Actualizar posición de cada item
    await Promise.all(
      items.map(({ id, position }) =>
        db
          .update(userListItems)
          .set({ position })
          .where(and(eq(userListItems.id, id), eq(userListItems.listId, list.id)))
      )
    );

    return reply.send({ ok: true });
  });
}
