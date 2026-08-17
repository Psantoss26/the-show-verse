// backend/src/level/stats.js
// Agregados de actividad que alimentan el XP.
//
// `assembleLevelStats` es puro: recibe los resultados de las consultas y produce
// el objeto de estadísticas normalizado. `collectLevelStats` es la capa fina que
// hace las consultas. Separarlos permite probar la normalización (que es donde
// están los coercionados y los valores ausentes) sin base de datos.

import { and, eq, isNotNull, sql } from 'drizzle-orm';

import {
  watchHistory,
  userRatings,
  titleComments,
  favorites,
  watchlist,
  userLists,
  userListItems,
  profileFavorites,
  follows,
  commentLikes,
  listLikes,
  communityLists,
} from '../db/schema.js';
import { getCompletedShowsCount } from '../lib/completedShows.js';
import { emptyLevelStats } from './rules.js';

// Una reseña "extensa" a partir de 300 caracteres: es el umbral que usa el bonus
// de XP y el logro correspondiente.
export const LONG_REVIEW_CHARS = 300;

function int(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/**
 * Normaliza los resultados de las consultas en el objeto de estadísticas que
 * consumen rules.js y achievements.js.
 */
export function assembleLevelStats(parts = {}) {
  const p = parts && typeof parts === 'object' ? parts : {};
  const history = p.history || {};
  const reviews = p.reviews || {};
  const likes = p.likes || {};
  const lists = p.lists || {};
  const watchDates = Array.isArray(p.watchDates) ? p.watchDates : [];

  const stats = emptyLevelStats();

  stats.movies = int(history.movies);
  stats.moviePlays = int(history.moviePlays);
  // Los revisionados se resuelven AQUÍ y no se dejan a la derivación de rules.js:
  // el objeto en blanco ya trae la clave a 0, así que la derivación no se
  // dispararía y los revisionados no puntuarían nunca.
  stats.movieRewatches = Math.max(0, stats.moviePlays - stats.movies);
  stats.episodes = int(history.episodes);
  stats.lateNightWatches = int(history.lateNightWatches);
  stats.bestMovieDay = int(p.bestMovieDay);
  stats.completedShows = int(p.completedShows);

  stats.ratings = int(p.ratings);
  stats.reviews = int(reviews.total);
  stats.longReviews = int(reviews.long);

  stats.favorites = int(p.favorites);
  stats.watchlist = int(p.watchlist);
  stats.profileFavorites = int(p.profileFavorites);

  stats.lists = int(lists.count);
  stats.listItems = int(lists.items);
  stats.largestList = int(lists.largest);

  stats.followers = int(p.followers);
  stats.following = int(p.following);

  stats.likesReceived = int(likes.receivedOnComments) + int(likes.receivedOnLists);
  stats.likesGiven = int(likes.givenOnComments) + int(likes.givenOnLists);

  // Los días activos son los días distintos con visionado: se derivan de las
  // fechas para que no puedan discrepar de la racha, que sale de las mismas.
  stats.watchDates = watchDates;
  stats.activeDays = watchDates.length;

  return stats;
}

/**
 * Ejecuta los agregados de un usuario. Todas las consultas van en paralelo; son
 * recuentos sobre índices ya existentes por `user_id`.
 */
export async function collectLevelStats(db, userId) {
  const isEpisode = and(
    eq(watchHistory.mediaType, 'tv'),
    isNotNull(watchHistory.season),
    isNotNull(watchHistory.episode),
  );

  const [
    historyRows,
    watchDateRows,
    bestMovieDayRows,
    completedShows,
    ratingRows,
    reviewRows,
    favoriteRows,
    watchlistRows,
    listRows,
    listItemRows,
    profileFavoriteRows,
    followerRows,
    followingRows,
    likesOnCommentsRows,
    likesOnListsRows,
    likesGivenCommentRows,
    likesGivenListRows,
  ] = await Promise.all([
    db
      .select({
        movies: sql`COUNT(DISTINCT CASE WHEN ${watchHistory.mediaType} = 'movie' THEN ${watchHistory.tmdbId} END)`.mapWith(Number),
        moviePlays: sql`COUNT(*) FILTER (WHERE ${watchHistory.mediaType} = 'movie')`.mapWith(Number),
        episodes: sql`COUNT(*) FILTER (WHERE ${isEpisode})`.mapWith(Number),
        lateNightWatches: sql`COUNT(*) FILTER (WHERE EXTRACT(HOUR FROM ${watchHistory.watchedAt} AT TIME ZONE 'UTC') < 5)`.mapWith(Number),
      })
      .from(watchHistory)
      .where(eq(watchHistory.userId, userId)),
    // Días distintos con actividad: alimentan a la vez `activeDays` y las rachas.
    db
      .select({ day: sql`DISTINCT (${watchHistory.watchedAt} AT TIME ZONE 'UTC')::date`.mapWith(String) })
      .from(watchHistory)
      .where(eq(watchHistory.userId, userId)),
    // Mejor día de películas (logro "Maratón"): títulos distintos en un mismo día.
    db
      .select({ n: sql`COUNT(DISTINCT ${watchHistory.tmdbId})`.mapWith(Number) })
      .from(watchHistory)
      .where(and(eq(watchHistory.userId, userId), eq(watchHistory.mediaType, 'movie')))
      .groupBy(sql`(${watchHistory.watchedAt} AT TIME ZONE 'UTC')::date`)
      .orderBy(sql`COUNT(DISTINCT ${watchHistory.tmdbId}) DESC`)
      .limit(1),
    getCompletedShowsCount(db, userId),
    db.select({ n: sql`COUNT(*)`.mapWith(Number) }).from(userRatings).where(eq(userRatings.userId, userId)),
    db
      .select({
        total: sql`COUNT(*)`.mapWith(Number),
        long: sql`COUNT(*) FILTER (WHERE LENGTH(${titleComments.body}) >= ${LONG_REVIEW_CHARS})`.mapWith(Number),
      })
      .from(titleComments)
      .where(and(eq(titleComments.userId, userId), eq(titleComments.source, 'native'))),
    db.select({ n: sql`COUNT(*)`.mapWith(Number) }).from(favorites).where(eq(favorites.userId, userId)),
    db.select({ n: sql`COUNT(*)`.mapWith(Number) }).from(watchlist).where(eq(watchlist.userId, userId)),
    db.select({ n: sql`COUNT(*)`.mapWith(Number) }).from(userLists).where(eq(userLists.userId, userId)),
    // Títulos en listas propias y tamaño de la lista más grande.
    db
      .select({ listId: userListItems.listId, n: sql`COUNT(*)`.mapWith(Number) })
      .from(userListItems)
      .innerJoin(userLists, eq(userLists.id, userListItems.listId))
      .where(eq(userLists.userId, userId))
      .groupBy(userListItems.listId),
    db.select({ n: sql`COUNT(*)`.mapWith(Number) }).from(profileFavorites).where(eq(profileFavorites.userId, userId)),
    db.select({ n: sql`COUNT(*)`.mapWith(Number) }).from(follows).where(eq(follows.followingId, userId)),
    db.select({ n: sql`COUNT(*)`.mapWith(Number) }).from(follows).where(eq(follows.followerId, userId)),
    // Me gusta recibidos en las reseñas propias.
    db
      .select({ n: sql`COUNT(*)`.mapWith(Number) })
      .from(commentLikes)
      .innerJoin(titleComments, eq(titleComments.id, commentLikes.commentId))
      .where(eq(titleComments.userId, userId)),
    // Me gusta recibidos en las listas propias publicadas en la comunidad.
    db
      .select({ n: sql`COUNT(*)`.mapWith(Number) })
      .from(listLikes)
      .innerJoin(communityLists, eq(communityLists.id, listLikes.listId))
      .innerJoin(userLists, eq(userLists.id, communityLists.userListId))
      .where(eq(userLists.userId, userId)),
    db.select({ n: sql`COUNT(*)`.mapWith(Number) }).from(commentLikes).where(eq(commentLikes.userId, userId)),
    db.select({ n: sql`COUNT(*)`.mapWith(Number) }).from(listLikes).where(eq(listLikes.userId, userId)),
  ]);

  const listSizes = listItemRows.map((row) => Number(row.n) || 0);

  return assembleLevelStats({
    history: historyRows[0] || {},
    watchDates: watchDateRows.map((row) => String(row.day).slice(0, 10)),
    bestMovieDay: bestMovieDayRows[0]?.n,
    completedShows,
    ratings: ratingRows[0]?.n,
    reviews: reviewRows[0] || {},
    favorites: favoriteRows[0]?.n,
    watchlist: watchlistRows[0]?.n,
    profileFavorites: profileFavoriteRows[0]?.n,
    lists: {
      count: listRows[0]?.n,
      items: listSizes.reduce((sum, n) => sum + n, 0),
      largest: listSizes.length ? Math.max(...listSizes) : 0,
    },
    followers: followerRows[0]?.n,
    following: followingRows[0]?.n,
    likes: {
      receivedOnComments: likesOnCommentsRows[0]?.n,
      receivedOnLists: likesOnListsRows[0]?.n,
      givenOnComments: likesGivenCommentRows[0]?.n,
      givenOnLists: likesGivenListRows[0]?.n,
    },
  });
}
