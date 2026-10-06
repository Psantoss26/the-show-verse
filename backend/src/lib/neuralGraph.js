// src/lib/neuralGraph.js
// Datos de la vista neuronal del perfil: TODOS los títulos que el usuario ha
// registrado (vistos, puntuados, favoritos y pendientes) con sus géneros,
// sagas, meses de visionado, listas, presupuesto, recaudación y nota de TMDb,
// en una sola respuesta compacta. Reglas puras en neuralGraphCore.js.
//
// OPTIMIZACIÓN, de lo más barato a lo más caro:
//   1. FIRMA del estado del usuario (una consulta de recuentos y fechas). Si el
//      cliente ya tiene esa versión (`?v=`), la respuesta es `{ unchanged }`.
//   2. Grafo ya construido para esa firma en Redis.
//   3. Construcción: cuatro consultas agregadas en paralelo y los metadatos de
//      TMDb leídos de tmdb_cache extrayendo SOLO los campos necesarios en SQL
//      (la ficha completa pesa KB por título; con miles de títulos serían MB).
//   4. Títulos sin metadatos: se piden a TMDb en tandas limitadas y con tope de
//      tiempo. Lo que no quepa se completa en segundo plano y la respuesta lo
//      indica (`missing`) para que el cliente vuelva a pedir una sola vez.

import crypto from 'node:crypto';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import {
  communityListItems,
  communityLists,
  favorites,
  listLikes,
  tmdbCache,
  userListItems,
  userLists,
  userRatings,
  watchHistory,
  watchlist,
} from '../db/schema.js';
import { cacheGet, cacheSet } from './redis.js';
import { getMediaMetadataMap } from '../utils/mediaMetadata.js';
import {
  NEURAL_GRAPH_VERSION,
  mergeTitleRecords,
  packNeuralGraph,
  pickTitleMeta,
  titleKey,
} from './neuralGraphCore.js';

const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
const FETCH_BATCH = 12;
const FETCH_MAX_PER_REQUEST = 240;
const FETCH_BUDGET_MS = 4_500;

// Una sola tanda de relleno en segundo plano por usuario a la vez.
const backgroundFills = new Set();

async function graphStamp(db, userId, { includePrivateLists = false } = {}) {
  const result = await db.execute(sql`
    select
      (select count(*) || '.' || coalesce(extract(epoch from max(created_at))::bigint, 0)
         from ${watchHistory} where user_id = ${userId}) as h,
      (select count(*) || '.' || coalesce(extract(epoch from max(updated_at))::bigint, 0)
         from ${userRatings} where user_id = ${userId}) as r,
      (select count(*) || '.' || coalesce(extract(epoch from max(added_at))::bigint, 0)
         from ${favorites} where user_id = ${userId}) as f,
      (select count(*) || '.' || coalesce(extract(epoch from max(added_at))::bigint, 0)
         from ${watchlist} where user_id = ${userId}) as w,
      (select count(*) || '.' || coalesce(extract(epoch from max(${userListItems.addedAt}))::bigint, 0)
              || '.' || coalesce((select extract(epoch from max(updated_at))::bigint
                                    from ${userLists} where user_id = ${userId}), 0)
         from ${userListItems} join ${userLists} on ${userLists.id} = ${userListItems.listId}
        where ${userLists.userId} = ${userId}) as l,
      (select count(*) || '.' || coalesce(extract(epoch from max(created_at))::bigint, 0)
         from ${listLikes} where user_id = ${userId}) as c
  `);
  const [row] = [...result];
  const raw = `${NEURAL_GRAPH_VERSION}|${row?.h}|${row?.r}|${row?.f}|${row?.w}|${row?.l}|${row?.c}|${includePrivateLists ? 1 : 0}`;
  return `${NEURAL_GRAPH_VERSION}-${crypto.createHash('sha1').update(raw).digest('base64url').slice(0, 16)}`;
}

async function loadRecords(db, userId) {
  const [history, ratings, favs, pending] = await Promise.all([
    db
      .select({
        tmdbId: watchHistory.tmdbId,
        mediaType: watchHistory.mediaType,
        plays: sql`count(*)::int`,
        lastAt: sql`max(${watchHistory.watchedAt})`,
        // Meses distintos en que lo vio (AAAAMM).
        months: sql`array_agg(distinct (extract(year from ${watchHistory.watchedAt}) * 100 + extract(month from ${watchHistory.watchedAt}))::int)`,
        title: sql`max(${watchHistory.title})`,
        posterPath: sql`max(${watchHistory.posterPath})`,
      })
      .from(watchHistory)
      .where(eq(watchHistory.userId, userId))
      .groupBy(watchHistory.tmdbId, watchHistory.mediaType),
    db
      .select({
        tmdbId: userRatings.tmdbId,
        mediaType: userRatings.mediaType,
        rating: userRatings.rating,
        title: userRatings.title,
        posterPath: userRatings.posterPath,
        lastAt: userRatings.ratedAt,
      })
      .from(userRatings)
      .where(and(
        eq(userRatings.userId, userId),
        inArray(userRatings.mediaType, ['movie', 'tv']),
        isNull(userRatings.season),
        isNull(userRatings.episode),
      )),
    db
      .select({ tmdbId: favorites.tmdbId, mediaType: favorites.mediaType, title: favorites.title, posterPath: favorites.posterPath, lastAt: favorites.addedAt })
      .from(favorites)
      .where(eq(favorites.userId, userId)),
    db
      .select({ tmdbId: watchlist.tmdbId, mediaType: watchlist.mediaType, title: watchlist.title, posterPath: watchlist.posterPath, lastAt: watchlist.addedAt })
      .from(watchlist)
      .where(eq(watchlist.userId, userId)),
  ]);
  return mergeTitleRecords({ history, ratings, favorites: favs, watchlist: pending });
}

// Listas que agrupan títulos del usuario: las suyas (las privadas solo si las
// ve él) y las de la comunidad que ha guardado con «me gusta». Las suyas
// publicadas en la comunidad no se repiten.
async function loadLists(db, userId, titles, { includePrivateLists = false } = {}) {
  const own = await db
    .select({ id: userLists.id, name: userLists.name })
    .from(userLists)
    .where(includePrivateLists
      ? eq(userLists.userId, userId)
      : and(eq(userLists.userId, userId), eq(userLists.isPublic, true)));
  const liked = await db
    .select({ id: communityLists.id, name: communityLists.name, userListId: communityLists.userListId })
    .from(listLikes)
    .innerJoin(communityLists, eq(communityLists.id, listLikes.listId))
    .where(eq(listLikes.userId, userId));
  const ownIds = new Set(own.map((list) => list.id));
  const community = liked.filter((list) => !list.userListId || !ownIds.has(list.userListId));

  const tmdbIds = [...new Set([...titles.values()].map((title) => title.tmdbId))];
  const keysByList = new Map();
  const collect = (listId, row) => {
    if (!keysByList.has(listId)) keysByList.set(listId, new Set());
    keysByList.get(listId).add(titleKey(row.mediaType, row.tmdbId));
  };
  // Las listas de usuario publicadas en la comunidad guardan sus títulos en
  // user_list_items; las importadas, en community_list_items.
  const userListIds = [...own.map((list) => list.id), ...community.map((list) => list.userListId).filter(Boolean)];
  const communityIds = community.filter((list) => !list.userListId).map((list) => list.id);
  for (let i = 0; i < tmdbIds.length && (userListIds.length || communityIds.length); i += 3000) {
    const chunk = tmdbIds.slice(i, i + 3000);
    if (userListIds.length) {
      const rows = await db
        .select({ listId: userListItems.listId, tmdbId: userListItems.tmdbId, mediaType: userListItems.mediaType })
        .from(userListItems)
        .where(and(inArray(userListItems.listId, userListIds), inArray(userListItems.tmdbId, chunk)));
      rows.forEach((row) => collect(row.listId, row));
    }
    if (communityIds.length) {
      const rows = await db
        .select({ listId: communityListItems.listId, tmdbId: communityListItems.tmdbId, mediaType: communityListItems.mediaType })
        .from(communityListItems)
        .where(and(inArray(communityListItems.listId, communityIds), inArray(communityListItems.tmdbId, chunk)));
      rows.forEach((row) => collect(row.listId, row));
    }
  }

  return [
    ...own.map((list) => ({ id: list.id, name: list.name, kind: 'own', keys: keysByList.get(list.id) || new Set() })),
    ...community.map((list) => ({
      id: list.id,
      name: list.name,
      kind: 'community',
      keys: keysByList.get(list.userListId || list.id) || new Set(),
    })),
  ];
}

// Metadatos de la caché de TMDb, solo con los campos que usa el grafo. Las
// claves de tmdb_cache existen en tres formas según quién la escribió.
async function loadCachedMeta(db, keys) {
  const meta = new Map();
  if (!keys.length) return meta;
  const cacheKeys = keys.flatMap((key) => [`bare:${key}`, `tmdb:${key}`, key]);
  for (let i = 0; i < cacheKeys.length; i += 3000) {
    const chunk = cacheKeys.slice(i, i + 3000);
    const rows = await db
      .select({
        cacheKey: tmdbCache.cacheKey,
        name: sql`coalesce(${tmdbCache.data}->>'title', ${tmdbCache.data}->>'name')`,
        posterPath: sql`${tmdbCache.data}->>'poster_path'`,
        date: sql`coalesce(${tmdbCache.data}->>'release_date', ${tmdbCache.data}->>'first_air_date')`,
        genres: sql`${tmdbCache.data}->'genres'`,
        collection: sql`${tmdbCache.data}->'belongs_to_collection'`,
        budget: sql`${tmdbCache.data}->>'budget'`,
        revenue: sql`${tmdbCache.data}->>'revenue'`,
        vote: sql`case when coalesce((${tmdbCache.data}->>'vote_count')::numeric, 0) > 0 then ${tmdbCache.data}->>'vote_average' end`,
      })
      .from(tmdbCache)
      .where(inArray(tmdbCache.cacheKey, chunk));
    for (const row of rows) {
      const key = String(row.cacheKey).replace(/^(bare|tmdb):/, '');
      const current = meta.get(key);
      // Entre varias copias, la que traiga géneros.
      if (!current || (!current.genres?.length && Array.isArray(row.genres) && row.genres.length)) {
        meta.set(key, {
          name: row.name || null,
          posterPath: row.posterPath || null,
          date: row.date || null,
          genres: Array.isArray(row.genres) ? row.genres : [],
          collection: row.collection && typeof row.collection === 'object' ? row.collection : null,
          budget: Number(row.budget) || 0,
          revenue: Number(row.revenue) || 0,
          vote: Number(row.vote) || 0,
        });
      }
    }
  }
  return meta;
}

// Pide a TMDb (y guarda en tmdb_cache) los títulos sin metadatos, en tandas.
async function fetchMissingMeta(missing, meta, { max = Infinity, budgetMs = Infinity } = {}) {
  const startedAt = Date.now();
  let fetched = 0;
  for (let i = 0; i < missing.length && fetched < max; i += FETCH_BATCH) {
    if (Date.now() - startedAt > budgetMs) break;
    const batch = missing.slice(i, Math.min(i + FETCH_BATCH, i + (max - fetched)));
    const data = await getMediaMetadataMap(batch).catch(() => new Map());
    for (const row of batch) {
      const picked = pickTitleMeta(data.get(titleKey(row.mediaType, row.tmdbId)));
      if (picked) meta.set(titleKey(row.mediaType, row.tmdbId), picked);
    }
    fetched += batch.length;
  }
  return fetched;
}

function fillInBackground(userId, missing, log) {
  if (!missing.length || backgroundFills.has(userId)) return;
  backgroundFills.add(userId);
  fetchMissingMeta(missing, new Map())
    .catch((err) => log?.warn?.({ err, userId }, '[neural] relleno de metadatos fallido'))
    .finally(() => backgroundFills.delete(userId));
}

/**
 * Grafo neural del usuario. Con `since` igual a la firma actual devuelve solo
 * `{ v, unchanged: true }`.
 */
export async function getUserNeuralGraph(db, userId, { since = null, log = null, includePrivateLists = false } = {}) {
  const stamp = await graphStamp(db, userId, { includePrivateLists });
  if (since && since === stamp) return { v: stamp, unchanged: true };

  const cacheKey = `neural:${userId}:${stamp}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const titles = await loadRecords(db, userId);
  const keys = [...titles.keys()];
  const meta = await loadCachedMeta(db, keys);

  const missing = keys
    .filter((key) => !meta.has(key))
    .map((key) => titles.get(key));
  if (missing.length && process.env.TMDB_API_KEY) {
    const fetched = await fetchMissingMeta(missing, meta, {
      max: FETCH_MAX_PER_REQUEST,
      budgetMs: FETCH_BUDGET_MS,
    });
    fillInBackground(userId, missing.slice(fetched), log);
  }

  const lists = await loadLists(db, userId, titles, { includePrivateLists });
  const packed = packNeuralGraph(titles, meta, lists);
  const payload = { v: stamp, generatedAt: new Date().toISOString(), ...packed };
  // Solo se guarda completo: uno a medias se reconstruye en la próxima visita,
  // cuando el relleno en segundo plano ya haya terminado.
  if (!packed.missing) await cacheSet(cacheKey, payload, CACHE_TTL_SECONDS);
  return payload;
}
