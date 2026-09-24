// src/lib/notifications.js
// Datos de la sección de alertas del navbar. Todo sale de tablas que ya existen:
//   - actividad propia: el mismo feed que la sección Social (scope=me);
//   - recordatorios: visionados recientes sin nota o sin reseña propia;
//   - novedades:
//       · entradas automáticas en "Continuar viendo" y pasos automáticos a
//         visto: los recibos de progreso (streaming_events);
//       · series completadas: el mismo criterio que el perfil;
//       · siguiente película de una colección: TMDb (belongs_to_collection).

import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import {
  streamingEvents,
  titleComments,
  tmdbCache,
  userRatings,
  watchHistory,
  watchProgress,
} from '../db/schema.js';
import { applySpanishTitles, fillMissingPosters, getUserActivity } from './userProfile.js';
import { getMediaMetadataMap, metadataFor } from '../utils/mediaMetadata.js';
import { computeShowProgress } from './showProgress.js';
import {
  NOTIFICATION_ACTION_TYPES,
  buildReminders,
  detectContinueWatchingAdds,
  nextInCollection,
  parseEntityKey,
  ratingTargetKey,
  reviewTargetKey,
  showCompletionTime,
  splitAutoCompleted,
} from './notificationsCore.js';

const WINDOW_DAYS = 14;
const ACTIONS_LIMIT = 15;
const REMINDERS_LIMIT = 10;
const EVENTS_LIMIT = 20;
const COLLECTION_CACHE_MS = 24 * 60 * 60 * 1000;

async function getAutoCompleted(db, userId, since) {
  const rows = await db
    .select({ id: streamingEvents.id, entityKey: streamingEvents.entityKey, observedAt: streamingEvents.observedAt })
    .from(streamingEvents)
    .where(and(
      eq(streamingEvents.userId, userId),
      gte(streamingEvents.observedAt, since),
      sql`${streamingEvents.result}->>'recorded' = 'true'`,
    ))
    .orderBy(desc(streamingEvents.observedAt))
    .limit(EVENTS_LIMIT);

  return rows
    .map((row) => {
      const entity = parseEntityKey(row.entityKey);
      if (!entity) return null;
      return { ...entity, id: `auto:${row.id}`, type: 'auto_watched', createdAt: row.observedAt };
    })
    .filter(Boolean);
}

// Recibos de la ventana con el resultado del recibo ANTERIOR de su misma
// entidad. Se mira un margen previo más amplio para que retomar algo empezado
// antes de la ventana no cuente como una entrada nueva.
async function getContinueWatchingAdds(db, userId, since) {
  const lookback = new Date(since.getTime() - 60 * 24 * 60 * 60 * 1000);
  const result = await db.execute(sql`
    select id, entity_key as "entityKey", observed_at as "observedAt", completed, prev_completed as "prevCompleted"
    from (
      select id, entity_key, observed_at,
        coalesce((result->>'completed')::boolean, false) as completed,
        lag(coalesce((result->>'completed')::boolean, false))
          over (partition by entity_key order by observed_at) as prev_completed
      from ${streamingEvents}
      where user_id = ${userId} and observed_at >= ${lookback.toISOString()}
    ) receipts
    where observed_at >= ${since.toISOString()}
    order by observed_at desc
    limit 200
  `);
  const adds = detectContinueWatchingAdds([...result]).slice(0, EVENTS_LIMIT);
  if (!adds.length) return adds;

  // Plataforma, título y cartel, si el contenido sigue en Continuar viendo.
  const progress = await db
    .select({
      tmdbId: watchProgress.tmdbId,
      mediaType: watchProgress.mediaType,
      season: watchProgress.season,
      episode: watchProgress.episode,
      platform: watchProgress.platform,
      title: watchProgress.title,
      posterPath: watchProgress.posterPath,
    })
    .from(watchProgress)
    .where(and(
      eq(watchProgress.userId, userId),
      inArray(watchProgress.tmdbId, [...new Set(adds.map((item) => item.tmdbId))]),
    ));
  for (const item of adds) {
    const row = progress.find((p) =>
      p.mediaType === item.mediaType &&
      Number(p.tmdbId) === item.tmdbId &&
      (p.season || null) === item.season &&
      (p.episode || null) === item.episode);
    if (!row) continue;
    item.platform = row.platform || null;
    item.title = row.title || null;
    item.posterPath = row.posterPath || null;
  }
  return adds;
}

async function getReminders(db, userId, watched) {
  if (!watched.length) return [];
  const ids = [...new Set(watched.map((row) => Number(row.tmdbId)))];
  const [ratings, reviews] = await Promise.all([
    db
      .select({
        tmdbId: userRatings.tmdbId,
        mediaType: userRatings.mediaType,
        season: userRatings.season,
        episode: userRatings.episode,
      })
      .from(userRatings)
      .where(and(eq(userRatings.userId, userId), inArray(userRatings.tmdbId, ids))),
    db
      .select({ tmdbId: titleComments.tmdbId, mediaType: titleComments.mediaType })
      .from(titleComments)
      .where(and(
        eq(titleComments.userId, userId),
        eq(titleComments.source, 'native'),
        inArray(titleComments.tmdbId, ids),
      )),
  ]);

  const ratedKeys = new Set(
    ratings.map((row) =>
      row.mediaType === 'episode'
        ? ratingTargetKey({ mediaType: 'tv', tmdbId: row.tmdbId, season: row.season, episode: row.episode })
        : `${row.mediaType}:${Number(row.tmdbId)}`,
    ),
  );
  const reviewedKeys = new Set(reviews.map((row) => reviewTargetKey(row)));
  return buildReminders(watched, ratedKeys, reviewedKeys, { limit: REMINDERS_LIMIT });
}

// Series que se han COMPLETADO dentro de la ventana (por primera vez).
async function getCompletedShows(db, userId, watched, since) {
  const showIds = [...new Set(
    watched.filter((row) => row.mediaType === 'tv' && row.episode != null).map((row) => Number(row.tmdbId)),
  )];
  if (!showIds.length) return [];

  const [rows, metadata] = await Promise.all([
    db
      .select({
        tmdbId: watchHistory.tmdbId,
        season: watchHistory.season,
        episode: watchHistory.episode,
        watchedAt: watchHistory.watchedAt,
      })
      .from(watchHistory)
      .where(and(
        eq(watchHistory.userId, userId),
        eq(watchHistory.mediaType, 'tv'),
        inArray(watchHistory.tmdbId, showIds),
      ))
      .orderBy(asc(watchHistory.watchedAt))
      .limit(5000),
    getMediaMetadataMap(showIds.map((tmdbId) => ({ mediaType: 'tv', tmdbId }))).catch(() => new Map()),
  ]);

  const out = [];
  for (const tmdbId of showIds) {
    const meta = metadataFor(metadata, 'tv', tmdbId) || {};
    const seasonEpisodeCounts = {};
    for (const season of Array.isArray(meta.seasons) ? meta.seasons : []) {
      const number = Number(season?.season_number);
      const count = Number(season?.episode_count || 0);
      if (number > 0 && count > 0) seasonEpisodeCounts[number] = count;
    }
    if (!Object.keys(seasonEpisodeCounts).length) continue;
    const completedAt = showCompletionTime(
      rows.filter((row) => Number(row.tmdbId) === tmdbId),
      (playCounts) => computeShowProgress(playCounts, seasonEpisodeCounts).baseComplete,
    );
    if (!completedAt || new Date(completedAt) < since) continue;
    out.push({
      id: `show-completed:${tmdbId}`,
      type: 'show_completed',
      tmdbId,
      mediaType: 'tv',
      season: null,
      episode: null,
      createdAt: completedAt,
    });
  }
  return out;
}

// Colección de TMDb con caché propia en tmdb_cache (cambia muy poco).
async function getCollection(db, collectionId) {
  const cacheKey = `bare:collection:${collectionId}`;
  const [hit] = await db
    .select({ data: tmdbCache.data, expiresAt: tmdbCache.expiresAt })
    .from(tmdbCache)
    .where(eq(tmdbCache.cacheKey, cacheKey))
    .limit(1);
  if (hit && (!hit.expiresAt || new Date(hit.expiresAt) > new Date())) return hit.data;
  if (!process.env.TMDB_API_KEY) return hit?.data || null;

  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/collection/${collectionId}?api_key=${process.env.TMDB_API_KEY}&language=es-ES`,
    );
    if (!res.ok) return hit?.data || null;
    const data = await res.json();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + COLLECTION_CACHE_MS);
    await db
      .insert(tmdbCache)
      .values({ cacheKey, data, fetchedAt: now, expiresAt })
      .onConflictDoUpdate({ target: tmdbCache.cacheKey, set: { data, fetchedAt: now, expiresAt } })
      .catch(() => {});
    return data;
  } catch {
    return hit?.data || null;
  }
}

// Tras ver una película de una colección: la siguiente de la saga que aún no
// se ha visto. Una alerta por colección (la del visionado más reciente).
async function getCollectionNext(db, userId, watched) {
  const movies = [];
  const seenMovies = new Set();
  for (const row of watched) {
    if (row.mediaType !== 'movie' || seenMovies.has(Number(row.tmdbId))) continue;
    seenMovies.add(Number(row.tmdbId));
    movies.push(row);
  }
  if (!movies.length) return [];

  const metadata = await getMediaMetadataMap(movies).catch(() => new Map());
  const withCollection = movies
    .map((row) => {
      const meta = metadataFor(metadata, 'movie', row.tmdbId) || {};
      return { row, collection: meta.belongs_to_collection, watchedTitle: meta.title || row.title || null };
    })
    .filter((entry) => entry.collection?.id);
  if (!withCollection.length) return [];

  const watchedMovieRows = await db
    .select({ tmdbId: watchHistory.tmdbId })
    .from(watchHistory)
    .where(and(eq(watchHistory.userId, userId), eq(watchHistory.mediaType, 'movie')));
  const watchedIds = new Set(watchedMovieRows.map((row) => Number(row.tmdbId)));

  const out = [];
  const seenCollections = new Set();
  for (const { row, collection, watchedTitle } of withCollection) {
    if (seenCollections.has(collection.id)) continue;
    seenCollections.add(collection.id);
    const data = await getCollection(db, collection.id);
    const next = nextInCollection(data?.parts, row.tmdbId, watchedIds);
    if (!next) continue;
    out.push({
      id: `collection-next:${collection.id}:${next.id}`,
      type: 'collection_next',
      tmdbId: Number(next.id),
      mediaType: 'movie',
      season: null,
      episode: null,
      title: next.title || null,
      posterPath: next.poster_path || null,
      releaseDate: next.release_date || null,
      collectionId: collection.id,
      collectionName: data?.name || collection.name || null,
      afterTitle: watchedTitle,
      afterTmdbId: Number(row.tmdbId),
      createdAt: row.createdAt,
    });
  }
  return out;
}

export async function getUserNotifications(db, userId) {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // Visionados de la ventana: alimentan recordatorios, series completadas y
  // colecciones, así que se leen una sola vez.
  const watched = await db
    .select({
      tmdbId: watchHistory.tmdbId,
      mediaType: watchHistory.mediaType,
      season: watchHistory.season,
      episode: watchHistory.episode,
      title: watchHistory.title,
      posterPath: watchHistory.posterPath,
      createdAt: watchHistory.watchedAt,
    })
    .from(watchHistory)
    .where(and(eq(watchHistory.userId, userId), gte(watchHistory.watchedAt, since)))
    .orderBy(desc(watchHistory.watchedAt))
    .limit(200);

  const [activity, reminders, autoCompleted, cwAdds, completedShows, collectionNext] = await Promise.all([
    getUserActivity(db, userId, { limit: 40 }),
    getReminders(db, userId, watched),
    getAutoCompleted(db, userId, since),
    getContinueWatchingAdds(db, userId, since),
    getCompletedShows(db, userId, watched, since).catch(() => []),
    getCollectionNext(db, userId, watched).catch(() => []),
  ]);

  const actions = splitAutoCompleted(
    activity.items.filter((item) => NOTIFICATION_ACTION_TYPES.has(item.type)),
    autoCompleted,
  ).slice(0, ACTIONS_LIMIT);

  const events = [...cwAdds, ...autoCompleted, ...completedShows, ...collectionNext]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, EVENTS_LIMIT);

  // La actividad ya viene con título y cartel; el resto sale de tablas que a
  // menudo no los guardan (los visionados sincronizados). Las películas de una
  // colección ya traen los suyos de TMDb.
  const bare = [...reminders, ...events.filter((item) => item.type !== 'collection_next')];
  if (bare.length) {
    await fillMissingPosters(db, userId, bare);
    const metadata = await getMediaMetadataMap(bare).catch(() => new Map());
    applySpanishTitles(bare, metadata);
  }

  return { actions, reminders, events, generatedAt: new Date().toISOString() };
}
