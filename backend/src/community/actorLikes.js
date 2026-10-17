// Me gusta en los actores / personas de TMDb (/details/person/:id).
//
// Mismo trato que los de las colecciones de TMDb: idempotentes (repetir la
// llamada no infla el recuento) y públicos. El recuento se calcula con COUNT
// sobre actor_likes (índice por actor).

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { actorLikes } from '../db/schema.js';

export const MAX_ACTOR_IDS = 300;

/** Id de persona de TMDb válido (entero positivo) o null. */
export function parsePersonId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 && id < 2_147_483_647 ? id : null;
}

/** «1,2,3» → [1, 2, 3] sin repetidos ni basura, como mucho MAX_ACTOR_IDS. */
export function parsePersonIds(value) {
  const ids = new Set();
  for (const part of String(value || '').split(',')) {
    const id = parsePersonId(part.trim());
    if (id) ids.add(id);
    if (ids.size >= MAX_ACTOR_IDS) break;
  }
  return [...ids];
}

async function countLikes(personId, executor = db) {
  const [row] = await executor
    .select({ n: sql`COUNT(*)`.mapWith(Number) })
    .from(actorLikes)
    .where(eq(actorLikes.personId, personId));
  return Number(row?.n) || 0;
}

/** Recuento público de cada persona y si ESTE visitante le dio me gusta. */
export async function getActorLikes({ ids, viewerId = null }) {
  const out = {};
  if (!ids.length) return out;
  for (const id of ids) out[id] = { likes: 0, liked: false };

  const counts = await db
    .select({ personId: actorLikes.personId, n: sql`COUNT(*)`.mapWith(Number) })
    .from(actorLikes)
    .where(inArray(actorLikes.personId, ids))
    .groupBy(actorLikes.personId);
  for (const row of counts) out[row.personId].likes = Number(row.n) || 0;

  if (viewerId) {
    const mine = await db
      .select({ personId: actorLikes.personId })
      .from(actorLikes)
      .where(and(eq(actorLikes.userId, viewerId), inArray(actorLikes.personId, ids)));
    for (const row of mine) out[row.personId].liked = true;
  }
  return out;
}

export async function likeActor({ personId, userId }) {
  await db
    .insert(actorLikes)
    .values({ personId, userId })
    .onConflictDoNothing({ target: [actorLikes.userId, actorLikes.personId] });
  return { liked: true, likes: await countLikes(personId) };
}

export async function unlikeActor({ personId, userId }) {
  await db
    .delete(actorLikes)
    .where(and(eq(actorLikes.personId, personId), eq(actorLikes.userId, userId)));
  return { liked: false, likes: await countLikes(personId) };
}
