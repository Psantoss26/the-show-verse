// backend/src/community/store.js
import { db } from '../db/client.js';
import { titleComments } from '../db/schema.js';
import { and, eq, desc, asc, sql, gt } from 'drizzle-orm';
import { resolveCommentTab } from './tabs.js';
import { commentRowToApi } from './normalize.js';

export async function getCommentsPage({ tmdbId, mediaType, tab, page = 1, limit = 5 }) {
  const { order, sinceDays } = resolveCommentTab(tab);
  const conds = [eq(titleComments.tmdbId, Number(tmdbId)), eq(titleComments.mediaType, mediaType)];
  if (sinceDays) {
    conds.push(gt(titleComments.createdAt, sql`now() - ${`${sinceDays} days`}::interval`));
  }
  const where = and(...conds);
  const orderBy = order === 'recent'
    ? [desc(titleComments.createdAt)]
    : [desc(titleComments.likes), desc(titleComments.createdAt)];

  const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 50);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const [rows, [{ count }]] = await Promise.all([
    db.select().from(titleComments).where(where).orderBy(...orderBy).limit(safeLimit).offset(offset),
    db.select({ count: sql`count(*)::int` }).from(titleComments).where(where),
  ]);

  const itemCount = Number(count) || 0;
  return {
    items: rows.map(commentRowToApi),
    pagination: {
      itemCount,
      pageCount: Math.ceil(itemCount / safeLimit) || 0,
      page: safePage,
      limit: safeLimit,
    },
  };
}

export async function getCommentCount({ tmdbId, mediaType }) {
  const [{ count }] = await db
    .select({ count: sql`count(*)::int` })
    .from(titleComments)
    .where(and(eq(titleComments.tmdbId, Number(tmdbId)), eq(titleComments.mediaType, mediaType)));
  return Number(count) || 0;
}

export async function insertNativeComment({ tmdbId, mediaType, userId, author, body, spoiler }) {
  const [row] = await db
    .insert(titleComments)
    .values({
      tmdbId: Number(tmdbId), mediaType, source: 'native', userId,
      authorName: author?.displayName || author?.username || 'Usuario',
      authorUsername: author?.username || null,
      authorAvatarUrl: author?.avatarUrl || null,
      authorIsVip: false, body, likes: 0, spoiler: !!spoiler,
    })
    .returning();
  return commentRowToApi(row);
}

export async function updateNativeComment({ id, userId, body, spoiler }) {
  const [row] = await db
    .update(titleComments)
    .set({ body, spoiler: !!spoiler })
    .where(and(eq(titleComments.id, id), eq(titleComments.userId, userId), eq(titleComments.source, 'native')))
    .returning();
  return row ? commentRowToApi(row) : null;
}

export async function deleteNativeComment({ id, userId }) {
  const rows = await db
    .delete(titleComments)
    .where(and(eq(titleComments.id, id), eq(titleComments.userId, userId), eq(titleComments.source, 'native')))
    .returning({ id: titleComments.id });
  return rows.length > 0;
}
