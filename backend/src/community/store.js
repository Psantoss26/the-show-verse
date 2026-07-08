// backend/src/community/store.js
import { db } from '../db/client.js';
import { titleComments, titleSentiment } from '../db/schema.js';
import { and, eq, desc, asc, sql, gt } from 'drizzle-orm';
import { resolveCommentTab } from './tabs.js';
import { commentRowToApi } from './normalize.js';
import { sentimentRowToApi } from './sentiment.js';

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
  const set = {};
  if (body !== undefined) set.body = body;
  if (spoiler !== undefined) set.spoiler = !!spoiler;
  const owner = and(eq(titleComments.id, id), eq(titleComments.userId, userId), eq(titleComments.source, 'native'));
  if (Object.keys(set).length === 0) {
    const [row] = await db.select().from(titleComments).where(owner).limit(1);
    return row ? commentRowToApi(row) : null;
  }
  const [row] = await db.update(titleComments).set(set).where(owner).returning();
  return row ? commentRowToApi(row) : null;
}

export async function deleteNativeComment({ id, userId }) {
  const rows = await db
    .delete(titleComments)
    .where(and(eq(titleComments.id, id), eq(titleComments.userId, userId), eq(titleComments.source, 'native')))
    .returning({ id: titleComments.id });
  return rows.length > 0;
}

export async function getSentiment({ tmdbId, mediaType }) {
  const [row] = await db.select().from(titleSentiment)
    .where(and(eq(titleSentiment.tmdbId, Number(tmdbId)), eq(titleSentiment.mediaType, mediaType))).limit(1);
  const count = await getCommentCount({ tmdbId, mediaType });
  if (!row) return { good: [], bad: [], comment_count: count };
  return sentimentRowToApi(row, count);
}

export async function upsertSentiment({ tmdbId, mediaType, good, bad, provider, model, sourceCommentCount, isProvisional }) {
  await db.insert(titleSentiment)
    .values({ tmdbId: Number(tmdbId), mediaType, good, bad, provider, model, sourceCommentCount, isProvisional, builtAt: new Date() })
    .onConflictDoUpdate({
      target: [titleSentiment.tmdbId, titleSentiment.mediaType],
      set: { good, bad, provider, model, sourceCommentCount, isProvisional, builtAt: new Date() },
    });
}
