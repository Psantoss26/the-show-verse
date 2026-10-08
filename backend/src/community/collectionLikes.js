// Me gusta en las colecciones de TMDb (/lists → Colecciones).
//
// Mismo trato que los de las listas de la comunidad: idempotentes (repetir la
// llamada no infla el recuento) y públicos. A diferencia de community_lists,
// las colecciones no tienen fila propia donde guardar un contador, así que el
// recuento se calcula con COUNT sobre collection_likes (índice por colección).

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { collectionLikes } from '../db/schema.js';

// Lo que cabe en una petición del índice (las destacadas son ~255).
export const MAX_COLLECTION_IDS = 300;

/** Id de colección de TMDb válido (entero positivo) o null. */
export function parseCollectionId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 && id < 2_147_483_647 ? id : null;
}

/** «1,2,3» → [1, 2, 3] sin repetidos ni basura, como mucho MAX_COLLECTION_IDS. */
export function parseCollectionIds(value) {
  const ids = new Set();
  for (const part of String(value || '').split(',')) {
    const id = parseCollectionId(part.trim());
    if (id) ids.add(id);
    if (ids.size >= MAX_COLLECTION_IDS) break;
  }
  return [...ids];
}

async function countLikes(collectionId, executor = db) {
  const [row] = await executor
    .select({ n: sql`COUNT(*)`.mapWith(Number) })
    .from(collectionLikes)
    .where(eq(collectionLikes.collectionId, collectionId));
  return Number(row?.n) || 0;
}

/** Recuento público de cada colección y si ESTE visitante le dio me gusta. */
export async function getCollectionLikes({ ids, viewerId = null }) {
  const out = {};
  if (!ids.length) return out;
  for (const id of ids) out[id] = { likes: 0, liked: false };

  const counts = await db
    .select({ collectionId: collectionLikes.collectionId, n: sql`COUNT(*)`.mapWith(Number) })
    .from(collectionLikes)
    .where(inArray(collectionLikes.collectionId, ids))
    .groupBy(collectionLikes.collectionId);
  for (const row of counts) out[row.collectionId].likes = Number(row.n) || 0;

  if (viewerId) {
    const mine = await db
      .select({ collectionId: collectionLikes.collectionId })
      .from(collectionLikes)
      .where(and(eq(collectionLikes.userId, viewerId), inArray(collectionLikes.collectionId, ids)));
    for (const row of mine) out[row.collectionId].liked = true;
  }
  return out;
}

export async function likeCollection({ collectionId, userId }) {
  await db
    .insert(collectionLikes)
    .values({ collectionId, userId })
    .onConflictDoNothing({ target: [collectionLikes.userId, collectionLikes.collectionId] });
  return { liked: true, likes: await countLikes(collectionId) };
}

export async function unlikeCollection({ collectionId, userId }) {
  await db
    .delete(collectionLikes)
    .where(and(eq(collectionLikes.collectionId, collectionId), eq(collectionLikes.userId, userId)));
  return { liked: false, likes: await countLikes(collectionId) };
}
