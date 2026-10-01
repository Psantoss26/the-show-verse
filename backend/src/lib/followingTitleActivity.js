// src/lib/followingTitleActivity.js
// "Tus amigos" en la ficha de un título: qué han hecho con ESTE título las
// cuentas que sigue el usuario (visto / progreso, nota, favorito, pendiente,
// reseña y listas públicas). Los perfiles son públicos, así que se muestra lo
// mismo que ya enseña su perfil, solo que filtrado por el título.
//
// buildFollowingTitleActivity es puro (tests); getFollowingTitleActivity hace
// las consultas: una por tabla para TODOS los seguidos a la vez, siempre
// filtradas por el título, así que el coste no crece con su historial.

import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import {
  favorites,
  follows,
  titleComments,
  userListItems,
  userLists,
  userRatings,
  users,
  watchHistory,
  watchlist,
} from '../db/schema.js';
import { getMediaMetadataMap } from '../utils/mediaMetadata.js';

// Cota defensiva: con más cuentas seguidas, las más recientes.
export const FOLLOWING_TITLE_MAX = 500;
const REVIEW_SNIPPET = 280;
// Filas con el mismo instante a partir de las cuales es una importación.
const BULK_GROUP_MIN = 3;

function time(value) {
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * ¿La fecha es real? Las importaciones guardan solo el día (medianoche o
 * mediodía UTC exactos) o muchas filas con el mismo instante. Esas fechas no se
 * enseñan como "hace 3 días"; el estado (visto, favorito…) sí vale.
 */
function isRealInstant(value, sameInstantCount = 1) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  if (sameInstantCount >= BULK_GROUP_MIN) return false;
  return !(date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0);
}

// Cuántas filas de esa persona comparten el instante. La consulta lo trae en
// (OJO: en esas subconsultas las columnas de fuera van CUALIFICADAS a mano;
// Drizzle las escribe sin tabla y "user_id" se resolvería a la de dentro.)
// `same` contando en TODA la tabla (una importación pone la misma fecha a cientos
// de títulos, y aquí solo llegan las filas de este); sin `same`, se cuenta en
// las filas recibidas.
function countByInstant(rows, key = 'at') {
  const counts = new Map();
  for (const row of rows) {
    const t = time(row[key]);
    counts.set(`${row.userId}|${t}`, (counts.get(`${row.userId}|${t}`) || 0) + 1);
  }
  return (row) => Math.max(Number(row.same) || 0, counts.get(`${row.userId}|${time(row[key])}`) || 1);
}

/** Episodios emitidos por temporada (sin especiales) a partir de la ficha de TMDb. */
export function airedEpisodeCounts(metadata) {
  const counts = {};
  for (const season of Array.isArray(metadata?.seasons) ? metadata.seasons : []) {
    const number = Number(season?.season_number);
    const episodes = Number(season?.episode_count || 0);
    if (number > 0 && episodes > 0) counts[number] = episodes;
  }
  return counts;
}

/**
 * @param {object} input
 * @param {'movie'|'tv'} input.mediaType
 * @param {Array} input.following   [{ id, username, displayName, avatarUrl }]
 * @param {Array} input.watches     [{ userId, season, episode, at }]
 * @param {Array} input.ratings     [{ userId, mediaType, season, episode, rating, at }]
 * @param {Array} input.favorites   [{ userId, at }]
 * @param {Array} input.watchlist   [{ userId, at }]
 * @param {Array} input.reviews     [{ id, userId, body, spoiler, likes, at }]
 * @param {Array} input.lists       [{ userId, listId, name, at }]
 * @param {Record<number, number>} [input.airedBySeason]  temporada → episodios emitidos
 */
export function buildFollowingTitleActivity(input) {
  const mediaType = input.mediaType === 'tv' ? 'tv' : 'movie';
  const following = Array.isArray(input.following) ? input.following : [];
  const people = new Map(following.map((user) => [user.id, { user, events: [] }]));
  const entry = (userId) => people.get(userId) || null;
  const seen = (person, at, real) => {
    person.events.push({ at: time(at), real });
  };

  // Visionados: por persona, plays y (series) episodios distintos y el último.
  const watchCount = countByInstant(input.watches || []);
  for (const row of input.watches || []) {
    const person = entry(row.userId);
    if (!person) continue;
    const w = person.watched || (person.watched = { plays: 0, episodes: new Set(), last: null, firstAt: null, lastAt: null, realLast: false });
    w.plays += 1;
    if (row.season != null && row.episode != null) w.episodes.add(`${row.season}-${row.episode}`);
    const t = time(row.at);
    if (!w.lastAt || t > w.lastAt) {
      w.lastAt = t;
      w.realLast = isRealInstant(row.at, watchCount(row));
      w.last = row.season != null && row.episode != null ? { season: Number(row.season), episode: Number(row.episode) } : null;
    }
    if (!w.firstAt || t < w.firstAt) w.firstAt = t;
    seen(person, row.at, isRealInstant(row.at, watchCount(row)));
  }

  const ratingCount = countByInstant(input.ratings || []);
  for (const row of input.ratings || []) {
    const person = entry(row.userId);
    if (!person) continue;
    const isTitle = row.mediaType === mediaType && row.season == null && row.episode == null;
    if (isTitle) person.rating = Number(row.rating);
    else if (row.mediaType === 'episode') person.episodeRatings = (person.episodeRatings || 0) + 1;
    else if (row.mediaType === 'season') person.seasonRatings = (person.seasonRatings || 0) + 1;
    seen(person, row.at, isRealInstant(row.at, ratingCount(row)));
  }

  for (const [field, rows] of [['favorite', input.favorites], ['watchlist', input.watchlist]]) {
    const counter = countByInstant(rows || []);
    for (const row of rows || []) {
      const person = entry(row.userId);
      if (!person) continue;
      person[field] = true;
      seen(person, row.at, isRealInstant(row.at, counter(row)));
    }
  }

  for (const row of input.reviews || []) {
    const person = entry(row.userId);
    if (!person) continue;
    // La más reciente de cada persona.
    if (!person.review || time(row.at) > time(person.review.at)) {
      const body = String(row.body || '').trim();
      person.review = {
        id: row.id,
        body: body.length > REVIEW_SNIPPET ? `${body.slice(0, REVIEW_SNIPPET).trimEnd()}…` : body,
        truncated: body.length > REVIEW_SNIPPET,
        spoiler: Boolean(row.spoiler),
        likes: Number(row.likes || 0),
        at: row.at,
      };
    }
    person.reviews = (person.reviews || 0) + 1;
    seen(person, row.at, true);
  }

  const listCount = countByInstant(input.lists || []);
  for (const row of input.lists || []) {
    const person = entry(row.userId);
    if (!person) continue;
    person.lists = person.lists || [];
    if (!person.lists.some((list) => list.id === row.listId)) person.lists.push({ id: row.listId, name: row.name });
    seen(person, row.at, isRealInstant(row.at, listCount(row)));
  }

  const aired = Object.values(input.airedBySeason || {}).reduce((sum, n) => sum + Number(n || 0), 0);

  const items = [];
  for (const person of people.values()) {
    if (!person.events.length) continue;
    let watched = null;
    let status = null;
    if (person.watched) {
      const w = person.watched;
      const distinct = w.episodes.size;
      if (mediaType === 'tv' && distinct > 0) {
        const progressPct = aired > 0 ? Math.min(100, Math.round((distinct / aired) * 100)) : null;
        const completed = aired > 0 && distinct >= aired;
        watched = {
          plays: w.plays,
          episodes: distinct,
          aired: aired || null,
          progressPct,
          completed,
          rewatching: completed && w.plays > distinct,
          lastEpisode: w.last,
          lastAt: w.realLast ? new Date(w.lastAt).toISOString() : null,
        };
        status = completed ? 'completed' : 'watching';
      } else {
        watched = {
          plays: w.plays,
          lastAt: w.realLast ? new Date(w.lastAt).toISOString() : null,
        };
        status = w.plays > 1 ? 'rewatched' : 'watched';
      }
    } else if (person.watchlist) status = 'planned';
    else if (person.rating != null) status = 'rated';
    else if (person.favorite) status = 'favorite';
    else if (person.review) status = 'reviewed';
    else status = 'listed';

    const real = person.events.filter((event) => event.real);
    const latest = (real.length ? real : person.events).reduce((max, event) => Math.max(max, event.at), 0);
    items.push({
      user: {
        username: person.user.username,
        displayName: person.user.displayName || person.user.username,
        avatarUrl: person.user.avatarUrl || null,
      },
      status,
      watched,
      rating: person.rating ?? null,
      episodeRatings: person.episodeRatings || 0,
      favorite: Boolean(person.favorite),
      watchlist: Boolean(person.watchlist),
      review: person.review ? { ...person.review, at: new Date(person.review.at).toISOString() } : null,
      reviews: person.reviews || 0,
      lists: person.lists || [],
      lastActivityAt: latest ? new Date(latest).toISOString() : null,
      // Sin ninguna fecha real (todo importado), no se enseña "hace X".
      lastActivityApprox: real.length === 0,
    });
  }

  // Primero quien tiene más que contar (reseña, nota, visto) y, a igualdad, lo
  // más reciente: así arriba queda lo útil para decidir si ver el título.
  const weight = (item) =>
    (item.review ? 4 : 0) + (item.rating != null ? 2 : 0) + (item.watched ? 2 : 0) + (item.favorite ? 1 : 0);
  items.sort((a, b) => weight(b) - weight(a) || time(b.lastActivityAt) - time(a.lastActivityAt));

  const rated = items.filter((item) => item.rating != null);
  const summary = {
    people: items.length,
    watched: items.filter((item) => item.watched).length,
    completed: items.filter((item) => item.status === 'completed').length,
    watching: items.filter((item) => item.status === 'watching').length,
    watchlist: items.filter((item) => item.watchlist).length,
    favorites: items.filter((item) => item.favorite).length,
    reviews: items.filter((item) => item.review).length,
    rated: rated.length,
    averageRating: rated.length
      ? Math.round((rated.reduce((sum, item) => sum + item.rating, 0) / rated.length) * 10) / 10
      : null,
  };

  return { mediaType, following: following.length, summary, items };
}

/** Actividad de los seguidos de `viewerId` sobre un título. */
export async function getFollowingTitleActivity(db, viewerId, { mediaType, tmdbId }) {
  const type = mediaType === 'tv' ? 'tv' : 'movie';
  const id = Number(tmdbId);

  const following = await db
    .select({ id: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl })
    .from(follows)
    .innerJoin(users, eq(users.id, follows.followingId))
    .where(and(eq(follows.followerId, viewerId), eq(users.isActive, true)))
    .orderBy(desc(follows.createdAt))
    .limit(FOLLOWING_TITLE_MAX);

  if (!following.length) return buildFollowingTitleActivity({ mediaType: type, following: [] });
  const ids = following.map((user) => user.id);

  const ratingTypes = type === 'tv' ? ['tv', 'season', 'episode'] : ['movie'];
  const [watches, ratings, favs, pending, reviews, lists, metadata] = await Promise.all([
    db
      .select({
        userId: watchHistory.userId,
        season: watchHistory.season,
        episode: watchHistory.episode,
        at: watchHistory.watchedAt,
        same: sql`(select count(*)::int from watch_history w2 where w2.user_id = "watch_history"."user_id" and w2.watched_at = "watch_history"."watched_at")`,
      })
      .from(watchHistory)
      .where(and(inArray(watchHistory.userId, ids), eq(watchHistory.tmdbId, id), eq(watchHistory.mediaType, type))),
    db
      .select({
        userId: userRatings.userId,
        mediaType: userRatings.mediaType,
        season: userRatings.season,
        episode: userRatings.episode,
        rating: userRatings.rating,
        at: userRatings.ratedAt,
        same: sql`(select count(*)::int from user_ratings r2 where r2.user_id = "user_ratings"."user_id" and r2.rated_at = "user_ratings"."rated_at")`,
      })
      .from(userRatings)
      .where(and(inArray(userRatings.userId, ids), eq(userRatings.tmdbId, id), inArray(userRatings.mediaType, ratingTypes))),
    db
      .select({
        userId: favorites.userId,
        at: favorites.addedAt,
        same: sql`(select count(*)::int from favorites f2 where f2.user_id = "favorites"."user_id" and f2.added_at = "favorites"."added_at")`,
      })
      .from(favorites)
      .where(and(inArray(favorites.userId, ids), eq(favorites.tmdbId, id), eq(favorites.mediaType, type))),
    db
      .select({
        userId: watchlist.userId,
        at: watchlist.addedAt,
        same: sql`(select count(*)::int from watchlist p2 where p2.user_id = "watchlist"."user_id" and p2.added_at = "watchlist"."added_at")`,
      })
      .from(watchlist)
      .where(and(inArray(watchlist.userId, ids), eq(watchlist.tmdbId, id), eq(watchlist.mediaType, type))),
    db
      .select({
        id: titleComments.id,
        userId: titleComments.userId,
        body: titleComments.body,
        spoiler: titleComments.spoiler,
        likes: titleComments.likes,
        at: titleComments.createdAt,
      })
      .from(titleComments)
      .where(and(
        inArray(titleComments.userId, ids),
        eq(titleComments.tmdbId, id),
        eq(titleComments.mediaType, type),
        eq(titleComments.source, 'native'),
      )),
    // Solo listas PÚBLICAS: las privadas no salen ni en su perfil.
    db
      .select({ userId: userLists.userId, listId: userLists.id, name: userLists.name, at: userListItems.addedAt })
      .from(userListItems)
      .innerJoin(userLists, eq(userLists.id, userListItems.listId))
      .where(and(
        inArray(userLists.userId, ids),
        eq(userLists.isPublic, true),
        eq(userListItems.tmdbId, id),
        eq(userListItems.mediaType, type),
      )),
    type === 'tv'
      ? getMediaMetadataMap([{ mediaType: 'tv', tmdbId: id }]).catch(() => new Map())
      : Promise.resolve(new Map()),
  ]);

  return buildFollowingTitleActivity({
    mediaType: type,
    following,
    watches,
    ratings,
    favorites: favs,
    watchlist: pending,
    reviews,
    lists,
    airedBySeason: type === 'tv' ? airedEpisodeCounts(metadata.get(`tv:${id}`)) : {},
  });
}
