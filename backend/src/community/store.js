// backend/src/community/store.js
import { db } from '../db/client.js';
import { titleComments, titleSentiment, communityLists, communityListItems, userLists } from '../db/schema.js';
import { and, eq, desc, asc, sql, gt } from 'drizzle-orm';
import { resolveCommentTab } from './tabs.js';
import { commentRowToApi, listRowToApi } from './normalize.js';
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

export async function upsertCommunityList(row) {
  // idx_community_lists_external is a PARTIAL unique index (source='trakt' AND external_id IS NOT NULL),
  // so the conflict target must repeat that predicate via targetWhere or Postgres can't find an arbiter index.
  const [out] = await db.insert(communityLists).values(row)
    .onConflictDoUpdate({
      target: communityLists.externalId,
      targetWhere: sql`${communityLists.source} = 'trakt' AND ${communityLists.externalId} IS NOT NULL`,
      set: { name: row.name, description: row.description, itemCount: row.itemCount,
        likes: row.likes, previewPosters: row.previewPosters, ownerAvatarUrl: row.ownerAvatarUrl },
    })
    .returning({ id: communityLists.id });
  return out.id;
}

export async function insertListMemberships(listId, items) {
  if (!items.length) return;
  await db.insert(communityListItems)
    .values(items.map((it, i) => ({
      listId, tmdbId: Number(it.tmdbId), mediaType: it.mediaType,
      title: it.title || null, posterPath: it.posterPath || null, position: it.position ?? i,
    })))
    .onConflictDoNothing({ target: [communityListItems.listId, communityListItems.tmdbId, communityListItems.mediaType] });
}

export async function getListsForTitle({ tmdbId, mediaType, limit = 6 }) {
  const rows = await db
    .select({
      id: communityLists.id, externalId: communityLists.externalId, slug: communityLists.slug,
      name: communityLists.name, description: communityLists.description,
      itemCount: communityLists.itemCount, likes: communityLists.likes,
      ownerName: communityLists.ownerName, ownerUsername: communityLists.ownerUsername,
      ownerAvatarUrl: communityLists.ownerAvatarUrl, previewPosters: communityLists.previewPosters,
    })
    .from(communityListItems)
    .innerJoin(communityLists, eq(communityListItems.listId, communityLists.id))
    .where(and(eq(communityListItems.tmdbId, Number(tmdbId)), eq(communityListItems.mediaType, mediaType)))
    .orderBy(desc(communityLists.likes))
    .limit(Math.min(Number(limit) || 6, 20));
  return rows.map(listRowToApi);
}

const SORTS = {
  items_desc: [desc(communityLists.itemCount)], items_asc: [asc(communityLists.itemCount)],
  likes_desc: [desc(communityLists.likes)], likes_asc: [asc(communityLists.likes)],
  name_asc: [asc(communityLists.name)], name_desc: [desc(communityLists.name)],
};

export async function discoverLists({ sort = 'items_desc', page = 1, limit = 30 }) {
  const orderBy = SORTS[sort] || SORTS.items_desc;
  const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 60);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * safeLimit;
  const rows = await db.select().from(communityLists).orderBy(...orderBy).limit(safeLimit).offset(offset);
  return rows.map(listRowToApi);
}

export async function getCommunityListWithItems({ id, page = 1, limit = 50 }) {
  const [list] = await db.select().from(communityLists).where(eq(communityLists.id, id)).limit(1);
  if (!list) return null;
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 150);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * safeLimit;
  const items = await db.select().from(communityListItems)
    .where(eq(communityListItems.listId, id))
    .orderBy(asc(communityListItems.position)).limit(safeLimit).offset(offset);
  return { list: listRowToApi(list).list, items };
}
