// src/routes/lists.js
// Listas personalizadas de usuario

import { z } from 'zod';
import { db } from '../db/client.js';
import { userLists, userListItems } from '../db/schema.js';
import { eq, and, asc, desc, sql } from 'drizzle-orm';
import { getMediaMetadataMap, metadataFor } from '../utils/mediaMetadata.js';
import { buildRatingSummary, hydrateListRatings, isMissingVoteAverageColumn } from '../utils/listRatings.js';

const userListItemFields = {
  id: userListItems.id,
  listId: userListItems.listId,
  tmdbId: userListItems.tmdbId,
  mediaType: userListItems.mediaType,
  title: userListItems.title,
  posterPath: userListItems.posterPath,
  position: userListItems.position,
  addedAt: userListItems.addedAt,
};

async function readUserListItems(listId) {
  const read = (includeStoredRating) => db
    .select(includeStoredRating
      ? { ...userListItemFields, voteAverage: userListItems.voteAverage }
      : userListItemFields)
    .from(userListItems)
    .where(eq(userListItems.listId, listId))
    .orderBy(asc(userListItems.position), desc(userListItems.addedAt));

  try {
    return await read(true);
  } catch (error) {
    if (!isMissingVoteAverageColumn(error)) throw error;
    return read(false);
  }
}

const listSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  // Las listas creadas en The Show Verse son contenido de comunidad por
  // defecto. La propiedad sigue existiendo para que el creador pueda decidir
  // ocultarla más adelante, pero crear una lista ya no la deja fuera de su
  // perfil por accidente.
  isPublic: z.boolean().optional().default(true),
  sortBy: z.enum(['added_at', 'title', 'position']).optional().default('added_at'),
});

const listItemSchema = z.object({
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(['movie', 'tv']),
  title: z.string().optional(),
  posterPath: z.string().optional(),
  voteAverage: z.number().min(0).max(10).optional(),
  position: z.number().int().min(0).optional(),
});

export default async function listsRoutes(fastify) {
  fastify.addHook('preHandler', fastify.requireAuth);

  // GET /lists — Listas del usuario (con item_count para las tarjetas)
  fastify.get('/', async (req, reply) => {
    const lists = await db
      .select({
        id: userLists.id,
        name: userLists.name,
        description: userLists.description,
        isPublic: userLists.isPublic,
        sortBy: userLists.sortBy,
        createdAt: userLists.createdAt,
        updatedAt: userLists.updatedAt,
        itemCount: sql`(select count(*)::int from user_list_items i where i.list_id = "user_lists"."id")`,
      })
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

  // GET /lists/:id — Detalle de una lista con items. El propietario puede
  // abrir cualquier lista suya; el resto de usuarios autenticados solo las
  // públicas que aparecen en el perfil de su creador.
  fastify.get('/:id', async (req, reply) => {
    const [list] = await db
      .select()
      .from(userLists)
      .where(eq(userLists.id, req.params.id))
      .limit(1);

    if (!list || (list.userId !== req.user.id && !list.isPublic)) {
      return reply.status(404).send({ error: 'List not found' });
    }

    const items = await readUserListItems(list.id);

    const ratedItems = await hydrateListRatings(items);

    return reply.send({
      list,
      items: ratedItems,
      ratingSummary: buildRatingSummary(ratedItems),
      canEdit: list.userId === req.user.id,
    });
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

    let { tmdbId, mediaType, title, posterPath, voteAverage, position = 0 } = parsed.data;

    // Enriquecer título/poster desde TMDb (cacheado) si el cliente no los aportó,
    // para que la tarjeta muestre portada aunque solo se pase el tmdbId.
    if (!title || !posterPath) {
      const meta = await getMediaMetadataMap([{ tmdbId, mediaType }]).catch(() => new Map());
      const m = metadataFor(meta, mediaType, tmdbId);
      if (m) {
        title = title
          || (mediaType === 'movie' ? m.title || m.original_title : m.name || m.original_name)
          || null;
        posterPath = posterPath || m.poster_path || null;
      }
    }

    const [item] = await db
      .insert(userListItems)
      .values({ listId: list.id, tmdbId, mediaType, title, posterPath, voteAverage, position })
      .onConflictDoUpdate({
        target: [userListItems.listId, userListItems.tmdbId, userListItems.mediaType],
        set: { position, voteAverage, addedAt: new Date() },
      })
      .returning();

    // Actualizar updatedAt de la lista
    await db.update(userLists).set({ updatedAt: new Date() }).where(eq(userLists.id, list.id));

    return reply.status(201).send({ item });
  });

  // DELETE /lists/:id/items — Vaciar la lista (quitar todos los items)
  fastify.delete('/:id/items', async (req, reply) => {
    const [list] = await db
      .select({ id: userLists.id })
      .from(userLists)
      .where(and(eq(userLists.id, req.params.id), eq(userLists.userId, req.user.id)))
      .limit(1);

    if (!list) return reply.status(404).send({ error: 'List not found' });

    await db.delete(userListItems).where(eq(userListItems.listId, list.id));
    await db.update(userLists).set({ updatedAt: new Date() }).where(eq(userLists.id, list.id));
    return reply.send({ ok: true });
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
