// backend/src/community/store.js
import { db } from '../db/client.js';
import {
  titleComments,
  titleSentiment,
  communityLists,
  communityListItems,
  userLists,
  commentLikes,
  listLikes,
} from '../db/schema.js';
import { and, eq, desc, asc, sql, inArray } from 'drizzle-orm';
import { RECENT_MIN_COMMENTS, RECENT_WINDOW_DAYS, resolveCommentTab } from './tabs.js';
import { COMMENT_LANGUAGES, detectCommentLanguage } from './commentLanguage.js';
import { commentRowToApi, listRowToApi, posterUrl } from './normalize.js';
import { sentimentRowToApi } from './sentiment.js';
import { getMediaMetadataMap, metadataFor } from '../utils/mediaMetadata.js';
import { buildRatingSummary, hydrateListRatings, isMissingVoteAverageColumn } from '../utils/listRatings.js';
import { mergeListItemRatings } from '../utils/listRatingMerge.js';
import { selectCommunityImdbSummarySample } from './listImdbSummarySample.js';
import { checkTmdbPosters, posterItemKey } from './posterlessItems.js';

const communityListItemFields = {
  id: communityListItems.id,
  listId: communityListItems.listId,
  tmdbId: communityListItems.tmdbId,
  mediaType: communityListItems.mediaType,
  title: communityListItems.title,
  posterPath: communityListItems.posterPath,
  position: communityListItems.position,
  addedAt: communityListItems.addedAt,
};

async function readCommunityListItemsWithRatings({ listId, limit, offset }) {
  const readItems = (includeStoredRating) => db
    .select(includeStoredRating
      ? { ...communityListItemFields, voteAverage: communityListItems.voteAverage }
      : communityListItemFields)
    .from(communityListItems)
    .where(eq(communityListItems.listId, listId))
    .orderBy(asc(communityListItems.position))
    .limit(limit)
    .offset(offset);

  const readRatingRows = (includeStoredRating) => db
    .select(includeStoredRating
      ? { tmdbId: communityListItems.tmdbId, mediaType: communityListItems.mediaType, voteAverage: communityListItems.voteAverage }
      : { tmdbId: communityListItems.tmdbId, mediaType: communityListItems.mediaType })
    .from(communityListItems)
    .where(eq(communityListItems.listId, listId));

  try {
    return await Promise.all([readItems(true), readRatingRows(true)]);
  } catch (error) {
    if (!isMissingVoteAverageColumn(error)) throw error;
    return Promise.all([readItems(false), readRatingRows(false)]);
  }
}

// Rellena posterPath (y título si falta) de items de lista comunitaria cuya columna
// posterPath es null (el sembrado solo hidrata 5 por lista). Usa el caché Postgres
// (tmdb_cache) vía getMediaMetadataMap, así en visitas repetidas es barato; además
// persiste lo hidratado en community_list_items para que la próxima lectura no toque
// TMDb.
//
// Lo que siga sin póster se comprueba en la galería de TMDb (posterlessItems.js):
// si tiene póster en cualquier idioma, se usa y se guarda; si TMDb ya no tiene
// el título o no tiene ningún póster, NO se devuelve (salía como un hueco que
// no llevaba a ninguna parte) y, en las listas importadas (`allowDelete`), se
// borra definitivamente. Ante un error pasajero de TMDb solo se oculta esta vez.
async function hydrateListItemPosters(items, { allowDelete = false } = {}) {
  const pending = items.filter((it) => !it.posterPath && it.tmdbId);
  if (!pending.length) return items;
  const meta = await getMediaMetadataMap(pending, {
    getMediaType: (r) => r.mediaType,
    getTmdbId: (r) => r.tmdbId,
  }).catch(() => new Map());

  const persist = [];
  for (const it of items) {
    if (it.posterPath || !it.tmdbId) continue;
    const m = metadataFor(meta, it.mediaType, it.tmdbId);
    if (!m) continue;
    const poster = m.poster_path || null;
    const title = it.title
      || (it.mediaType === 'movie' ? m.title || m.original_title : m.name || m.original_name)
      || null;
    if (poster || (title && title !== it.title)) {
      it.posterPath = poster || it.posterPath;
      if (title) it.title = title;
      persist.push({ id: it.id, posterPath: it.posterPath, title: it.title });
    }
  }
  const stillMissing = items.filter((it) => !it.posterPath);
  const checks = stillMissing.length
    ? await checkTmdbPosters(stillMissing).catch(() => new Map())
    : new Map();
  const removeIds = [];
  for (const it of stillMissing) {
    const check = checks.get(posterItemKey(it.mediaType, it.tmdbId));
    if (check?.status === 'poster') {
      it.posterPath = check.posterPath;
      persist.push({ id: it.id, posterPath: it.posterPath, title: it.title });
    } else if (check?.status === 'missing' && it.id) {
      removeIds.push(it.id);
    }
  }

  // Persistencia en segundo plano (no bloquea la respuesta).
  if (persist.length) {
    Promise.all(persist.map((u) =>
      db.update(communityListItems)
        .set({ posterPath: u.posterPath, title: u.title })
        .where(eq(communityListItems.id, u.id))
        .catch(() => {}),
    )).catch(() => {});
  }
  if (allowDelete && removeIds.length) {
    db.delete(communityListItems)
      .where(inArray(communityListItems.id, removeIds))
      .catch(() => {});
  }
  return items.filter((it) => it.posterPath);
}

// Idioma de los comentarios de Trakt guardados antes de detectarlo: se calcula
// con su propio texto (sin volver a Trakt) la primera vez que se leen, así los
// que no están en inglés o español desaparecen ya, sin esperar a renovarlos.
async function backfillCommentLanguages({ tmdbId, mediaType }) {
  const pending = await db.select({ id: titleComments.id, body: titleComments.body })
    .from(titleComments)
    .where(and(
      eq(titleComments.tmdbId, Number(tmdbId)),
      eq(titleComments.mediaType, mediaType),
      eq(titleComments.source, 'trakt'),
      sql`${titleComments.lang} IS NULL`,
    ))
    .limit(2000);
  if (!pending.length) return;
  const byLang = new Map();
  for (const row of pending) {
    const lang = detectCommentLanguage(row.body);
    if (!byLang.has(lang)) byLang.set(lang, []);
    byLang.get(lang).push(row.id);
  }
  await Promise.all([...byLang].map(([lang, ids]) =>
    db.update(titleComments).set({ lang }).where(inArray(titleComments.id, ids))));
}

export async function getCommentsPage({ tmdbId, mediaType, tab, sort, page = 1, limit = 5, viewerId = null }) {
  const { order, recentWindow } = resolveCommentTab(tab, sort);
  await backfillCommentLanguages({ tmdbId, mediaType }).catch(() => {});
  const titleConds = [
    eq(titleComments.tmdbId, Number(tmdbId)),
    eq(titleComments.mediaType, mediaType),
    // Solo inglés y español (los de la app se enseñan siempre).
    sql`(${titleComments.source} = 'native' OR ${inArray(titleComments.lang, COMMENT_LANGUAGES)})`,
  ];
  const conds = [...titleConds];
  if (recentWindow) {
    // Recientes por likes: los de los últimos 30 días o, si son pocos, los
    // RECENT_MIN_COMMENTS más nuevos (sin ese mínimo, en la mayoría de títulos
    // la pestaña salía vacía). Sin tantos comentarios, todos (-infinity).
    const nthNewest = db.select({ createdAt: titleComments.createdAt }).from(titleComments)
      .where(and(...titleConds))
      .orderBy(desc(titleComments.createdAt))
      .limit(1).offset(RECENT_MIN_COMMENTS - 1);
    conds.push(sql`${titleComments.createdAt} >= least(
      now() - ${`${RECENT_WINDOW_DAYS} days`}::interval,
      coalesce((${nthNewest}), '-infinity'::timestamptz)
    )`);
  }
  const where = and(...conds);
  const orderBy = order === 'recent'
    ? [desc(titleComments.createdAt)]
    : order === 'likes'
      ? [desc(titleComments.likes), desc(titleComments.createdAt)]
      // Popularidad: me gusta + respuestas; a igualdad, más me gusta y más nuevo.
      : [desc(sql`${titleComments.likes} + ${titleComments.replies}`), desc(titleComments.likes), desc(titleComments.createdAt)];

  const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 50);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const [rows, [{ count }]] = await Promise.all([
    db.select().from(titleComments).where(where).orderBy(...orderBy).limit(safeLimit).offset(offset),
    db.select({ count: sql`count(*)::int` }).from(titleComments).where(where),
  ]);

  const liked = await likedCommentIds(viewerId, rows.map((row) => row.id));

  const itemCount = Number(count) || 0;
  return {
    items: rows.map((row) => commentRowToApi({ ...row, likedByViewer: liked.has(row.id) })),
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

// ─────────────────────────────────────────────
// ME GUSTA (reseñas y listas)
// ─────────────────────────────────────────────
// El contador denormalizado (`likes`) se AJUSTA, no se recalcula: para los
// comentarios y listas importados de Trakt ese contador trae el recuento de
// Trakt, y recalcularlo desde comment_likes lo pondría a cero. El índice único
// garantiza la idempotencia: solo se toca el contador cuando la fila realmente
// se insertó o se borró, así que dar dos veces me gusta no infla nada.

/** Marca me gusta en una reseña. Devuelve el estado resultante o null si no existe. */
export async function likeComment({ commentId, userId }) {
  const inserted = await db
    .insert(commentLikes)
    .values({ commentId, userId })
    .onConflictDoNothing({ target: [commentLikes.userId, commentLikes.commentId] })
    .returning({ id: commentLikes.id });

  if (inserted.length) {
    const [row] = await db
      .update(titleComments)
      .set({ likes: sql`${titleComments.likes} + 1` })
      .where(eq(titleComments.id, commentId))
      .returning({ likes: titleComments.likes });
    if (!row) return null;
    return { liked: true, likes: Number(row.likes) || 0 };
  }

  // Ya estaba: se devuelve el estado actual sin tocar el contador.
  const [row] = await db
    .select({ likes: titleComments.likes })
    .from(titleComments)
    .where(eq(titleComments.id, commentId))
    .limit(1);
  return row ? { liked: true, likes: Number(row.likes) || 0 } : null;
}

/** Quita el me gusta de una reseña. */
export async function unlikeComment({ commentId, userId }) {
  const removed = await db
    .delete(commentLikes)
    .where(and(eq(commentLikes.commentId, commentId), eq(commentLikes.userId, userId)))
    .returning({ id: commentLikes.id });

  if (removed.length) {
    const [row] = await db
      .update(titleComments)
      .set({ likes: sql`GREATEST(0, ${titleComments.likes} - 1)` })
      .where(eq(titleComments.id, commentId))
      .returning({ likes: titleComments.likes });
    if (!row) return null;
    return { liked: false, likes: Number(row.likes) || 0 };
  }

  const [row] = await db
    .select({ likes: titleComments.likes })
    .from(titleComments)
    .where(eq(titleComments.id, commentId))
    .limit(1);
  return row ? { liked: false, likes: Number(row.likes) || 0 } : null;
}

/** Marca me gusta en una lista de la comunidad. */
export async function likeCommunityList({ listId, userId }) {
  // Una lista que no existe es un 404, no un error de clave ajena (500) al
  // insertar el me gusta.
  const [exists] = await db
    .select({ id: communityLists.id })
    .from(communityLists)
    .where(eq(communityLists.id, listId))
    .limit(1);
  if (!exists) return null;

  const inserted = await db
    .insert(listLikes)
    .values({ listId, userId })
    .onConflictDoNothing({ target: [listLikes.userId, listLikes.listId] })
    .returning({ id: listLikes.id });

  if (inserted.length) {
    const [row] = await db
      .update(communityLists)
      .set({ likes: sql`${communityLists.likes} + 1` })
      .where(eq(communityLists.id, listId))
      .returning({ likes: communityLists.likes });
    if (!row) return null;
    return { liked: true, likes: Number(row.likes) || 0 };
  }

  const [row] = await db
    .select({ likes: communityLists.likes })
    .from(communityLists)
    .where(eq(communityLists.id, listId))
    .limit(1);
  return row ? { liked: true, likes: Number(row.likes) || 0 } : null;
}

/** Quita el me gusta de una lista de la comunidad. */
export async function unlikeCommunityList({ listId, userId }) {
  const removed = await db
    .delete(listLikes)
    .where(and(eq(listLikes.listId, listId), eq(listLikes.userId, userId)))
    .returning({ id: listLikes.id });

  if (removed.length) {
    const [row] = await db
      .update(communityLists)
      .set({ likes: sql`GREATEST(0, ${communityLists.likes} - 1)` })
      .where(eq(communityLists.id, listId))
      .returning({ likes: communityLists.likes });
    if (!row) return null;
    return { liked: false, likes: Number(row.likes) || 0 };
  }

  const [row] = await db
    .select({ likes: communityLists.likes })
    .from(communityLists)
    .where(eq(communityLists.id, listId))
    .limit(1);
  return row ? { liked: false, likes: Number(row.likes) || 0 } : null;
}

/** Dueño de una reseña, para invalidar su nivel cuando recibe un me gusta. */
export async function getCommentOwnerId(commentId) {
  const [row] = await db
    .select({ userId: titleComments.userId })
    .from(titleComments)
    .where(eq(titleComments.id, commentId))
    .limit(1);
  return row?.userId || null;
}

/** Dueño de una lista de la comunidad, si es una lista de un usuario nuestro. */
export async function getCommunityListOwnerId(listId) {
  const [row] = await db
    .select({ userId: userLists.userId })
    .from(communityLists)
    .innerJoin(userLists, eq(userLists.id, communityLists.userListId))
    .where(eq(communityLists.id, listId))
    .limit(1);
  return row?.userId || null;
}

/** Ids (de un conjunto dado) a los que este visitante ya dio me gusta. */
async function likedCommentIds(viewerId, commentIds) {
  if (!viewerId || !commentIds.length) return new Set();
  const rows = await db
    .select({ commentId: commentLikes.commentId })
    .from(commentLikes)
    .where(and(eq(commentLikes.userId, viewerId), inArray(commentLikes.commentId, commentIds)));
  return new Set(rows.map((row) => row.commentId));
}

async function likedListIds(viewerId, listIds) {
  if (!viewerId || !listIds.length) return new Set();
  const rows = await db
    .select({ listId: listLikes.listId })
    .from(listLikes)
    .where(and(eq(listLikes.userId, viewerId), inArray(listLikes.listId, listIds)));
  return new Set(rows.map((row) => row.listId));
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
      title: it.title || null, posterPath: it.posterPath || null,
      voteAverage: Number.isFinite(Number(it.voteAverage)) ? Number(it.voteAverage) : null,
      position: it.position ?? i,
    })))
    .onConflictDoNothing({ target: [communityListItems.listId, communityListItems.tmdbId, communityListItems.mediaType] });
}

export async function getListsForTitle({ tmdbId, mediaType, limit = 12, viewerId = null }) {
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
    .limit(Math.min(Number(limit) || 10, 20));
  const previews = await readListPreviews(rows.map((row) => row.id), 5).catch(() => new Map());
  const refreshed = rows.map((row) => {
    const items = previews.get(row.id);
    if (!items?.length) return row;
    const previewPosters = items.map((item) => posterUrl(item.posterPath)).filter(Boolean);
    if (previewPosters.length) {
      row.previewPosters = previewPosters;
      // La vista ya puede usar la portada completada; persistirla evita repetir
      // el trabajo en las siguientes visitas del título.
      db.update(communityLists)
        .set({ previewPosters })
        .where(eq(communityLists.id, row.id))
        .catch(() => {});
    }
    return row;
  });
  const liked = await likedListIds(viewerId, refreshed.map((row) => row.id));
  return refreshed.map((row) => listRowToApi({ ...row, likedByViewer: liked.has(row.id) }));
}

const SORTS = {
  items_desc: [desc(communityLists.itemCount)], items_asc: [asc(communityLists.itemCount)],
  likes_desc: [desc(communityLists.likes)], likes_asc: [asc(communityLists.likes)],
  name_asc: [asc(communityLists.name)], name_desc: [desc(communityLists.name)],
};

export const MAX_DISCOVER_PREVIEW_ITEMS = 12;

// Primeros títulos de VARIAS listas en una sola consulta (vistas previas del
// índice de /lists). Antes el navegador pedía /lists/:id por cada tarjeta: doce
// peticiones de 0,4-0,8 s en producción, cada una calculando además la media de
// TODA la lista, que la vista previa no usa. Sin borrar nada: es un listado.
// Filas de vista previa cuyo póster ya se está buscando (una vez por proceso).
const previewBackfillInflight = new Set();
function backfillPreviewPosters(rows) {
  const pending = rows.filter((row) => row?.id && !previewBackfillInflight.has(row.id));
  if (!pending.length) return;
  pending.forEach((row) => previewBackfillInflight.add(row.id));
  hydrateListItemPosters(pending.map((row) => ({ ...row })), { allowDelete: false })
    .catch(() => {})
    .finally(() => pending.forEach((row) => previewBackfillInflight.delete(row.id)));
}

async function readListPreviews(listIds, limit) {
  const ids = [...new Set(listIds.filter(Boolean))];
  const max = Math.min(Math.max(Number(limit) || 0, 0), MAX_DISCOVER_PREVIEW_ITEMS);
  if (!ids.length || !max) return new Map();
  // Leer candidatos extra permite completar la portada aunque algún elemento
  // inicial de la lista ya no tenga póster disponible en TMDb.
  const candidateLimit = Math.min(max * 2, 24);
  const ranked = db
    .select({
      ...communityListItemFields,
      rank: sql`row_number() over (partition by ${communityListItems.listId} order by ${communityListItems.position} asc)`.as('rank'),
    })
    .from(communityListItems)
    .where(inArray(communityListItems.listId, ids))
    .as('ranked');
  const rows = await db
    .select()
    .from(ranked)
    .where(sql`${ranked.rank} <= ${candidateLimit}`)
    .orderBy(asc(ranked.listId), asc(ranked.position));
  // Sin esperar a TMDb: se responde con los pósters ya guardados y los que
  // faltan se rellenan EN SEGUNDO PLANO (se guardan para la siguiente vez).
  // Antes la primera petición de cada página esperaba a TMDb (~5 s en local,
  // más en producción): el service worker la cortaba a los 6 s y la app
  // enseñaba «no hay copia guardada en este dispositivo» hasta recargar.
  backfillPreviewPosters(rows.filter((row) => !row.posterPath));
  const visible = rows.filter((row) => row.posterPath);
  const byList = new Map(ids.map((id) => [id, []]));
  for (const it of visible) {
    const previews = byList.get(it.listId);
    if (!previews || previews.length >= max) continue;
    previews.push({
      tmdbId: it.tmdbId,
      mediaType: it.mediaType,
      title: it.title || null,
      posterPath: it.posterPath || null,
    });
  }
  return byList;
}

// Búsqueda por nombre del índice de «Listas de la comunidad». `ILIKE` con los
// comodines del usuario escapados: buscar «100%» no es «cualquier cosa».
export const MAX_DISCOVER_QUERY_LENGTH = 80;
function discoverNameFilter(query) {
  const term = String(query || '').trim().slice(0, MAX_DISCOVER_QUERY_LENGTH);
  if (!term) return undefined;
  const escaped = term.replace(/[\\%_]/g, (char) => `\\${char}`);
  return sql`${communityLists.name} ilike ${`%${escaped}%`}`;
}

// Una página del índice con lo necesario para seguir paginando: `hasMore` (se
// lee una fila de más) y `totals` (listas, títulos y me gusta de TODAS las
// listas con ese filtro, para la cabecera; `total` = número de listas). Antes el
// cliente pedía solo la primera página de 30 y no había forma de ver el resto,
// aunque la base de datos guardase cientos.
export async function discoverListsPage({ sort = 'items_desc', page = 1, limit = 30, query = '', viewerId = null, previewItems = 0 }) {
  const orderBy = Object.hasOwn(SORTS, sort) ? SORTS[sort] : SORTS.items_desc;
  const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 60);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * safeLimit;
  // Quien mira no ve SUS listas publicadas: ya las tiene en «Mis listas».
  const notOwnedByViewer = viewerId
    ? sql`NOT EXISTS (
        SELECT 1 FROM ${userLists}
         WHERE ${userLists.id} = ${communityLists.userListId}
           AND ${userLists.userId} = ${viewerId}
      )`
    : undefined;
  const where = and(discoverNameFilter(query), notOwnedByViewer);
  // Las listas de los usuarios de la app se ordenan como las demás, con el
  // criterio elegido (antes iban siempre delante). El id desempata: con un
  // orden estable, ninguna lista se repite ni se salta entre páginas.
  const [rows, [sums = {}]] = await Promise.all([
    db.select().from(communityLists).where(where)
      .orderBy(...orderBy, asc(communityLists.id))
      .limit(safeLimit + 1).offset(offset),
    db.select({
      lists: sql`count(*)::int`,
      items: sql`coalesce(sum(${communityLists.itemCount}), 0)::bigint`,
      likes: sql`coalesce(sum(${communityLists.likes}), 0)::bigint`,
    }).from(communityLists).where(where),
  ]);
  const hasMore = rows.length > safeLimit;
  const pageRows = rows.slice(0, safeLimit);
  const listIds = pageRows.map((row) => row.id);
  const [liked, previews] = await Promise.all([
    likedListIds(viewerId, listIds),
    // Una vista previa que falla no tumba el índice: el cliente la pide aparte.
    readListPreviews(listIds, previewItems).catch(() => new Map()),
  ]);
  const results = pageRows.map((row) => {
    const api = listRowToApi({ ...row, likedByViewer: liked.has(row.id) });
    return previews.has(row.id) ? { ...api, previewItems: previews.get(row.id) } : api;
  });
  const totals = {
    lists: Number(sums.lists) || 0,
    items: Number(sums.items) || 0,
    likes: Number(sums.likes) || 0,
  };
  return { results, hasMore, total: totals.lists, totals };
}

export async function discoverLists(options = {}) {
  return (await discoverListsPage(options)).results;
}

export async function getCommunityListWithItems({ id, page = 1, limit = 50, viewerId = null }) {
  const [list] = await db.select().from(communityLists).where(eq(communityLists.id, id)).limit(1);
  if (!list) return null;
  const liked = await likedListIds(viewerId, [id]);
  list.likedByViewer = liked.has(id);
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 150);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * safeLimit;
  // Una lectura local de todos los ids/puntuaciones, nunca peticiones TMDb.
  // Sirve para que la media sea de la lista completa aunque su grid pagine.
  const [items, allRatingRows] = await readCommunityListItemsWithRatings({
    listId: id,
    limit: safeLimit,
    offset,
  });
  // Solo en las listas importadas de Trakt se borran de verdad los títulos sin
  // póster: las de usuario reflejan su lista personal y ahí solo se ocultan.
  const hydrated = await hydrateListItemPosters(items, { allowDelete: list.source === 'trakt' });
  const ratedItems = await hydrateListRatings(allRatingRows);
  const visibleItems = mergeListItemRatings(hydrated, ratedItems);
  const api = listRowToApi(list);
  return {
    // `liked` va DENTRO de la lista: es donde lo lee la ficha (list.liked).
    // `listRowToApi` lo deja al lado de `list` (así lo usa el índice), y aquí
    // solo se copiaban `list` y `user`: con sesión la ficha recibía siempre
    // la lista sin `liked` y, al volver o recargar, el corazón salía vacío
    // aunque el me gusta estuviera guardado en list_likes.
    list: { ...api.list, user: api.user, liked: api.liked },
    items: visibleItems,
    ratingSummary: buildRatingSummary(ratedItems),
    // La muestra para IMDb es deliberadamente ligera: permite una media más
    // representativa que la primera página sin enviar/renderizar más tarjetas.
    imdbRatingItems: selectCommunityImdbSummarySample(allRatingRows),
  };
}
