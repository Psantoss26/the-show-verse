// Listas de USUARIO publicadas en «Listas de la comunidad».
//
// `community_lists` ya admitía `source = 'user'` con `user_list_id`; hasta
// ahora solo había listas importadas de Trakt. Publicar una lista propia crea
// (o actualiza) su fila de comunidad con una COPIA de sus títulos, que se
// resincroniza al editarla. No hay columna de «publicada»: lo está si existe su
// fila de comunidad. Al borrar la lista de usuario, la de comunidad se va sola
// (FK `on delete cascade`), con sus títulos y sus «me gusta».
//
// Solo se publican listas PÚBLICAS: si la lista pasa a privada, se retira.

import { and, asc, desc, eq } from 'drizzle-orm';

import { db } from '../db/client.js';
import { communityListItems, communityLists, userListItems, userLists, users } from '../db/schema.js';
import { posterUrl } from './normalize.js';

const PREVIEW_POSTERS = 5;

/**
 * Fila de `community_lists` de una lista de usuario. Pura (se prueba aparte).
 * `likes` se conserva al resincronizar: son de la comunidad, no de la lista.
 */
export function buildUserCommunityRow({ list, owner, items, likes = 0 }) {
  const rows = Array.isArray(items) ? items : [];
  return {
    source: 'user',
    userListId: list.id,
    externalId: null,
    slug: null,
    name: list.name,
    description: list.description || null,
    ownerName: owner?.displayName || owner?.username || null,
    ownerUsername: owner?.username || null,
    ownerAvatarUrl: owner?.avatarUrl || null,
    itemCount: rows.length,
    copiedItemCount: rows.length,
    likes: Number(likes) || 0,
    privacy: 'public',
    traktUrl: null,
    previewPosters: rows
      .map((item) => posterUrl(item.posterPath))
      .filter(Boolean)
      .slice(0, PREVIEW_POSTERS),
  };
}

/** id de la lista de comunidad de una lista de usuario (o null si no está publicada). */
export async function getUserListCommunityId(userListId, executor = db) {
  const [row] = await executor
    .select({ id: communityLists.id })
    .from(communityLists)
    .where(and(eq(communityLists.source, 'user'), eq(communityLists.userListId, userListId)))
    .limit(1);
  return row?.id || null;
}

/** Retira la lista de la comunidad (con sus títulos y «me gusta»). */
export async function unpublishUserList(userListId, executor = db) {
  await executor
    .delete(communityLists)
    .where(and(eq(communityLists.source, 'user'), eq(communityLists.userListId, userListId)));
}

/**
 * Publica (o resincroniza) la lista en la comunidad. Devuelve el id de su
 * lista de comunidad, o null si no se puede publicar (no existe o es privada;
 * en ese caso se retira por si estaba).
 */
export async function publishUserList(userListId) {
  return db.transaction(async (tx) => {
    const [list] = await tx.select().from(userLists).where(eq(userLists.id, userListId)).limit(1);
    if (!list || !list.isPublic) {
      await unpublishUserList(userListId, tx);
      return null;
    }
    const [owner] = await tx
      .select({ username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl })
      .from(users)
      .where(eq(users.id, list.userId))
      .limit(1);
    const items = await tx
      .select({
        tmdbId: userListItems.tmdbId,
        mediaType: userListItems.mediaType,
        title: userListItems.title,
        posterPath: userListItems.posterPath,
        voteAverage: userListItems.voteAverage,
      })
      .from(userListItems)
      .where(eq(userListItems.listId, list.id))
      .orderBy(asc(userListItems.position), desc(userListItems.addedAt));

    const [existing] = await tx
      .select({ id: communityLists.id, likes: communityLists.likes })
      .from(communityLists)
      .where(and(eq(communityLists.source, 'user'), eq(communityLists.userListId, list.id)))
      .limit(1);

    const row = buildUserCommunityRow({ list, owner, items, likes: existing?.likes });
    let communityId = existing?.id;
    if (communityId) {
      await tx.update(communityLists).set(row).where(eq(communityLists.id, communityId));
      await tx.delete(communityListItems).where(eq(communityListItems.listId, communityId));
    } else {
      const [created] = await tx.insert(communityLists).values(row).returning({ id: communityLists.id });
      communityId = created.id;
    }

    if (items.length) {
      await tx
        .insert(communityListItems)
        .values(
          items.map((item, position) => ({
            listId: communityId,
            tmdbId: Number(item.tmdbId),
            mediaType: item.mediaType,
            title: item.title || null,
            posterPath: item.posterPath || null,
            voteAverage: Number.isFinite(Number(item.voteAverage)) ? Number(item.voteAverage) : null,
            position,
          })),
        )
        .onConflictDoNothing({
          target: [communityListItems.listId, communityListItems.tmdbId, communityListItems.mediaType],
        });
    }
    return communityId;
  });
}

/**
 * Tras cualquier cambio de una lista de usuario: si estaba publicada, se
 * resincroniza (o se retira si ha pasado a privada). Nunca hace fallar el
 * cambio en sí: la copia de la comunidad es secundaria.
 */
export async function syncPublishedUserList(userListId, log) {
  try {
    if (await getUserListCommunityId(userListId)) await publishUserList(userListId);
  } catch (error) {
    log?.warn?.({ err: error, userListId }, 'No se pudo sincronizar la lista con la comunidad');
  }
}
