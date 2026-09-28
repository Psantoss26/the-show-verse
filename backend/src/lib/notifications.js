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
  completionMarks,
  detectContinueWatchingAdds,
  nextInCollection,
  parseEntityKey,
  ratingTargetKey,
  reviewTargetKey,
  splitAutoCompleted,
  watchEventAt,
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

async function getReminders(db, userId, watched, completions) {
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

  const ratedKeys = new Set(ratings.map((row) => ratingTargetKey(row)));
  const reviewedKeys = new Set(reviews.map((row) => reviewTargetKey(row)));
  return buildReminders(watched, ratedKeys, reviewedKeys, { completions, limit: REMINDERS_LIMIT });
}

// Temporadas y series TERMINADAS por los visionados de la ventana. Devuelve las
// marcas de cada serie (para los recordatorios) y las series completadas por
// primera vez dentro de la ventana (novedad "Has completado la serie").
async function getShowCompletions(db, userId, watched, since) {
  const completions = new Map();
  const completedShows = [];
  const showIds = [...new Set(
    watched.filter((row) => row.mediaType === 'tv' && row.episode != null).map((row) => Number(row.tmdbId)),
  )];
  if (!showIds.length) return { completions, completedShows };

  const [rows, metadata] = await Promise.all([
    db
      .select({
        id: watchHistory.id,
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
      .orderBy(asc(watchHistory.watchedAt), asc(watchHistory.season), asc(watchHistory.episode))
      .limit(5000),
    getMediaMetadataMap(showIds.map((tmdbId) => ({ mediaType: 'tv', tmdbId }))).catch(() => new Map()),
  ]);

  const eventAtById = new Map(watched.map((row) => [String(row.id), row.createdAt]));
  for (const tmdbId of showIds) {
    const meta = metadataFor(metadata, 'tv', tmdbId) || {};
    const seasonEpisodeCounts = {};
    for (const season of Array.isArray(meta.seasons) ? meta.seasons : []) {
      const number = Number(season?.season_number);
      const count = Number(season?.episode_count || 0);
      if (number > 0 && count > 0) seasonEpisodeCounts[number] = count;
    }
    if (!Object.keys(seasonEpisodeCounts).length) continue;
    const showRows = rows.filter((row) => Number(row.tmdbId) === tmdbId);
    const marks = completionMarks(
      showRows,
      seasonEpisodeCounts,
      (playCounts) => computeShowProgress(playCounts, seasonEpisodeCounts).baseComplete,
    );
    completions.set(tmdbId, marks);

    if (!marks.showRowId) continue;
    const completedAt = eventAtById.get(marks.showRowId)
      || showRows.find((row) => String(row.id) === marks.showRowId)?.watchedAt;
    if (!completedAt || new Date(completedAt) < since) continue;
    completedShows.push({
      id: `show-completed:${tmdbId}`,
      type: 'show_completed',
      tmdbId,
      mediaType: 'tv',
      season: null,
      episode: null,
      createdAt: completedAt,
    });
  }
  return { completions, completedShows };
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
  // colecciones, así que se leen una sola vez. Entran también los registrados a
  // mano en la ventana con fecha pasada (ver watchEventAt); `singleTitle` dice
  // si la inserción fue de un solo título, para dejar fuera las importaciones.
  const watchedResult = await db.execute(sql`
    select id, tmdb_id as "tmdbId", media_type as "mediaType", season, episode,
      title, poster_path as "posterPath", watched_at as "watchedAt", created_at as "createdAt",
      (min(tmdb_id) over batch = max(tmdb_id) over batch
        and min(media_type) over batch = max(media_type) over batch) as "singleTitle"
    from ${watchHistory}
    where user_id = ${userId}
      and (watched_at >= ${since.toISOString()} or created_at >= ${since.toISOString()})
    window batch as (partition by created_at)
  `);
  const watched = [...watchedResult]
    .map((row) => ({
      id: row.id,
      tmdbId: Number(row.tmdbId),
      mediaType: row.mediaType,
      season: row.season,
      episode: row.episode,
      title: row.title,
      posterPath: row.posterPath,
      createdAt: watchEventAt(row),
    }))
    .filter((row) => row.createdAt >= since)
    // Del más reciente al más antiguo; a igual momento (una temporada marcada
    // de golpe), el último episodio primero.
    .sort((a, b) =>
      b.createdAt - a.createdAt
      || (b.season ?? 0) - (a.season ?? 0)
      || (b.episode ?? 0) - (a.episode ?? 0))
    .slice(0, 200);

  const { completions, completedShows } = await getShowCompletions(db, userId, watched, since)
    .catch(() => ({ completions: new Map(), completedShows: [] }));

  const [activity, reminders, autoCompleted, cwAdds, collectionNext] = await Promise.all([
    getUserActivity(db, userId, { limit: 40 }),
    getReminders(db, userId, watched, completions),
    getAutoCompleted(db, userId, since),
    getContinueWatchingAdds(db, userId, since),
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
