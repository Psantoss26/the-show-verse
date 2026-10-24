// src/lib/todayActivity.js
// Página Hoy: qué han visto, puntuado y reseñado en la ventana elegida las
// cuentas que sigo (o toda la comunidad). Como en Trakt, el servidor solo
// entrega las acciones planas (visto · nota · reseña) y el cliente arma las
// historias, los destacados y el ranking.
//
// A diferencia del feed de /social (getFollowingActivity, 11 consultas POR
// cuenta), aquí hay una consulta por tabla para TODAS las cuentas a la vez,
// acotada por fecha: el coste depende de la ventana, no de a cuántos sigues.

import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';

import {
  follows,
  titleComments,
  userRatings,
  users,
  watchHistory,
  watchlist,
} from '../db/schema.js';
import { getLevelSummaries } from '../level/store.js';
import { getMediaMetadataMap, metadataFor } from '../utils/mediaMetadata.js';
import { cacheDel, withCache } from './redis.js';
import {
  actionsInRange,
  buildTodayActions,
  countActionsByDay,
  episodeMilestone,
  localDayKey,
  normalizeScope,
  resolveTodayRange,
  safeTimeZone,
  todayDays,
  TODAY_WEEK_DAYS,
} from './todayActivityCore.js';
import {
  applyResolvedEnglishPosterPaths,
  FEED_FOLLOWING_MAX,
  resolveEnglishPosterPaths,
  titleKey,
} from './userProfile.js';

// Cota por tabla: una semana muy activa en la comunidad no puede convertirse en
// una respuesta desproporcionada. Se quedan las más recientes.
export const TODAY_SOURCE_MAX = 2000;
const FOR_YOU_MAX = 25;
const CACHE_TTL = { following: 30, community: 60 };

export function todayCacheKey(scope, viewerId, day, tz) {
  return scope === 'community'
    ? `today:v1:community:${tz}:${day}`
    : `today:v1:following:${viewerId}:${day}`;
}

/** Al seguir o dejar de seguir, la pestaña Siguiendo debe cambiar ya. */
export async function invalidateTodayFollowing(viewerId) {
  if (!viewerId) return;
  await Promise.all(
    ['today', 'week', 'yesterday'].map((day) => cacheDel(todayCacheKey('following', viewerId, day))),
  ).catch(() => {});
}

// Autores de la ventana. Siguiendo: las cuentas seguidas activas. Comunidad:
// todas las activas salvo las que se excluyeron en Ajustes.
function authorFilter(scope, userCol, followingIds) {
  if (scope === 'following') return inArray(userCol, followingIds);
  return sql`${userCol} in (
    select u.id from users u
    where u.is_active = true
      and not exists (
        select 1 from user_preferences p
        where p.user_id = u.id and coalesce(p.ui_settings->>'hideFromCommunityToday', 'false') = 'true'
      )
  )`;
}

async function loadSourceRows(db, scope, followingIds, startAt, endAt) {
  const from = new Date(startAt);
  const to = new Date(endAt);
  return Promise.all([
    db
      .select({
        id: watchHistory.id,
        userId: watchHistory.userId,
        tmdbId: watchHistory.tmdbId,
        mediaType: watchHistory.mediaType,
        season: watchHistory.season,
        episode: watchHistory.episode,
        activityGroup: watchHistory.activityGroup,
        at: watchHistory.watchedAt,
        same: sql`(select count(*)::int from watch_history w2 where w2.user_id = "watch_history"."user_id" and w2.watched_at = "watch_history"."watched_at")`,
      })
      .from(watchHistory)
      .where(and(
        authorFilter(scope, watchHistory.userId, followingIds),
        gte(watchHistory.watchedAt, from),
        lt(watchHistory.watchedAt, to),
      ))
      .orderBy(desc(watchHistory.watchedAt))
      .limit(TODAY_SOURCE_MAX),
    db
      .select({
        id: userRatings.id,
        userId: userRatings.userId,
        tmdbId: userRatings.tmdbId,
        mediaType: userRatings.mediaType,
        season: userRatings.season,
        episode: userRatings.episode,
        rating: userRatings.rating,
        at: userRatings.ratedAt,
        same: sql`(select count(*)::int from user_ratings r2 where r2.user_id = "user_ratings"."user_id" and r2.rated_at = "user_ratings"."rated_at")`,
      })
      .from(userRatings)
      .where(and(
        authorFilter(scope, userRatings.userId, followingIds),
        gte(userRatings.ratedAt, from),
        lt(userRatings.ratedAt, to),
      ))
      .orderBy(desc(userRatings.ratedAt))
      .limit(TODAY_SOURCE_MAX),
    db
      .select({
        id: titleComments.id,
        userId: titleComments.userId,
        tmdbId: titleComments.tmdbId,
        mediaType: titleComments.mediaType,
        body: titleComments.body,
        spoiler: titleComments.spoiler,
        likes: titleComments.likes,
        at: titleComments.createdAt,
      })
      .from(titleComments)
      .where(and(
        eq(titleComments.source, 'native'),
        authorFilter(scope, titleComments.userId, followingIds),
        gte(titleComments.createdAt, from),
        lt(titleComments.createdAt, to),
      ))
      .orderBy(desc(titleComments.createdAt))
      .limit(TODAY_SOURCE_MAX),
  ]);
}

function imagePaths(meta) {
  return {
    posterPath: meta?.poster_path || null,
    backdropPath: meta?.backdrop_path || null,
  };
}

// Título, cartel y fondo de cada acción, más el hito del episodio. Las
// temporadas y episodios se hidratan con su serie.
async function hydrateActions(db, actions) {
  const titles = [...new Map(actions.map((a) => [titleKey(a.mediaType, a.tmdbId), a])).values()]
    .map((a) => ({ mediaType: a.mediaType, tmdbId: a.tmdbId }));
  const [metadata, englishPosters] = await Promise.all([
    getMediaMetadataMap(titles).catch(() => new Map()),
    resolveEnglishPosterPaths(db, titles).catch(() => new Map()),
  ]);
  const media = new Map();
  for (const title of titles) {
    const meta = metadataFor(metadata, title.mediaType, title.tmdbId);
    const [withPoster] = applyResolvedEnglishPosterPaths([{ ...title, ...imagePaths(meta) }], englishPosters);
    media.set(titleKey(title.mediaType, title.tmdbId), {
      type: title.mediaType,
      tmdbId: title.tmdbId,
      title: title.mediaType === 'movie'
        ? meta?.title || meta?.original_title || null
        : meta?.name || meta?.original_name || null,
      year: String((title.mediaType === 'movie' ? meta?.release_date : meta?.first_air_date) || '').slice(0, 4) || null,
      posterPath: withPoster.posterPath,
      backdropPath: withPoster.backdropPath,
    });
  }
  return actions
    .map((action) => {
      const meta = metadataFor(metadata, action.mediaType, action.tmdbId);
      return {
        ...action,
        media: media.get(titleKey(action.mediaType, action.tmdbId)) || null,
        milestone: action.target === 'episode' ? episodeMilestone(action.season, action.episode, meta) : null,
      };
    })
    // Sin título no hay nada que enseñar (ficha borrada de TMDb).
    .filter((action) => action.media?.title);
}

async function loadAuthors(db, ids) {
  if (!ids.length) return new Map();
  const [rows, levels] = await Promise.all([
    db
      .select({ id: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl })
      .from(users)
      .where(inArray(users.id, ids)),
    getLevelSummaries(db, ids).catch(() => new Map()),
  ]);
  return new Map(rows.map((row) => [row.id, {
    id: row.id,
    username: row.username,
    displayName: row.displayName || row.username,
    avatarUrl: row.avatarUrl || null,
    level: levels.get(row.id) || null,
  }]));
}

/**
 * «Para ti»: episodios nuevos de series que el usuario está viendo y títulos de
 * su lista de pendientes que se estrenan dentro de la ventana. Sale de los
 * metadatos ya cacheados (sin llamadas a TMDb).
 */
async function loadForYou(db, viewerId, range, tz) {
  const fromKey = localDayKey(range.startAt, tz);
  const toKey = localDayKey(range.endAt - 1, tz);
  const inWindow = (date) => Boolean(date) && date >= fromKey && date <= toKey;
  const since = new Date(range.startAt - 120 * 24 * 60 * 60 * 1000);

  const [shows, pending] = await Promise.all([
    db
      .select({ tmdbId: watchHistory.tmdbId, last: sql`max(${watchHistory.watchedAt})` })
      .from(watchHistory)
      .where(and(eq(watchHistory.userId, viewerId), eq(watchHistory.mediaType, 'tv'), gte(watchHistory.watchedAt, since)))
      .groupBy(watchHistory.tmdbId)
      .orderBy(desc(sql`max(${watchHistory.watchedAt})`))
      .limit(200),
    db
      .select({ tmdbId: watchlist.tmdbId, mediaType: watchlist.mediaType })
      .from(watchlist)
      .where(eq(watchlist.userId, viewerId))
      .limit(500),
  ]);

  const candidates = [
    ...shows.map((row) => ({ mediaType: 'tv', tmdbId: Number(row.tmdbId), source: 'progress' })),
    ...pending.map((row) => ({ mediaType: row.mediaType === 'tv' ? 'tv' : 'movie', tmdbId: Number(row.tmdbId), source: 'watchlist' })),
  ];
  if (!candidates.length) return [];
  const metadata = await getMediaMetadataMap(candidates, { fetchMissing: false }).catch(() => new Map());

  const seen = new Set();
  const out = [];
  for (const item of candidates) {
    const key = titleKey(item.mediaType, item.tmdbId);
    if (seen.has(key)) continue;
    const meta = metadataFor(metadata, item.mediaType, item.tmdbId);
    if (!meta) continue;
    const base = {
      key: `for-you:${key}`,
      media: {
        type: item.mediaType,
        tmdbId: item.tmdbId,
        title: item.mediaType === 'movie' ? meta.title || meta.original_title : meta.name || meta.original_name,
        ...imagePaths(meta),
      },
    };
    if (item.mediaType === 'tv') {
      const last = meta.last_episode_to_air;
      if (!inWindow(last?.air_date)) continue;
      seen.add(key);
      out.push({
        ...base,
        reason: item.source === 'progress' ? 'new_episode' : 'watchlist_release',
        releasedAt: last.air_date,
        season: Number(last.season_number) || null,
        episode: Number(last.episode_number) || null,
        episodeName: last.name || null,
        milestone: episodeMilestone(last.season_number, last.episode_number, meta),
      });
    } else if (inWindow(meta.release_date)) {
      seen.add(key);
      out.push({ ...base, reason: 'watchlist_release', releasedAt: meta.release_date });
    }
  }
  return out
    .filter((item) => item.media.title)
    .sort((a, b) => String(b.releasedAt).localeCompare(String(a.releasedAt)))
    .slice(0, FOR_YOU_MAX);
}

async function buildToday(db, viewerId, { scope, range, tz, nowMs, withForYou = true }) {
  let followingIds = [];
  let followingCount = 0;
  if (scope === 'following') {
    const rows = await db
      .select({ id: follows.followingId })
      .from(follows)
      .innerJoin(users, eq(users.id, follows.followingId))
      .where(and(eq(follows.followerId, viewerId), eq(users.isActive, true)))
      .orderBy(desc(follows.createdAt))
      .limit(FEED_FOLLOWING_MAX);
    followingIds = rows.map((row) => row.id);
    followingCount = followingIds.length;
  }

  const days = todayDays(nowMs, tz);
  const week = { key: 'week', startAt: days[TODAY_WEEK_DAYS - 1].startAt, endAt: days[0].endAt };
  // La consulta cubre la semana (para los recuentos de las pestañas) y, si se
  // pidió un día más antiguo, también ese día.
  const startAt = Math.min(week.startAt, range.startAt);
  const endAt = Math.max(week.endAt, range.endAt);

  const [watches, ratings, comments] = scope === 'following' && !followingIds.length
    ? [[], [], []]
    : await loadSourceRows(db, scope, followingIds, startAt, endAt);
  const all = buildTodayActions({ watches, ratings, comments });
  const counted = countActionsByDay(all, [...days, week]);
  const selected = actionsInRange(all, range);

  const [hydrated, authors, forYou] = await Promise.all([
    hydrateActions(db, selected),
    loadAuthors(db, [...new Set(selected.map((a) => a.userId))]),
    withForYou ? loadForYou(db, viewerId, range, tz).catch(() => []) : null,
  ]);
  const actions = hydrated
    .map(({ userId, mediaType, tmdbId, ...action }) => ({ ...action, user: authors.get(userId) || null }))
    .filter((action) => action.user);

  return {
    scope,
    range: {
      day: range.day,
      startAt: new Date(range.startAt).toISOString(),
      endAt: new Date(range.endAt).toISOString(),
      tz,
    },
    days: counted.map((day) => ({
      key: day.key,
      startAt: new Date(day.startAt).toISOString(),
      endAt: new Date(day.endAt).toISOString(),
      count: day.count,
    })),
    following: followingCount,
    truncated: [watches, ratings, comments].some((rows) => rows.length >= TODAY_SOURCE_MAX),
    actions,
    forYou,
  };
}

// En Comunidad la respuesta es compartida: a quién sigue el que mira (para el
// botón Seguir de «Más activos») se calcula aparte, sin caché.
async function viewerFollowsAmong(db, viewerId, actions) {
  const ids = [...new Set((actions || []).map((a) => a.user?.id).filter((id) => id && id !== viewerId))];
  if (!ids.length) return [];
  const rows = await db
    .select({ id: follows.followingId })
    .from(follows)
    .where(and(eq(follows.followerId, viewerId), inArray(follows.followingId, ids)));
  return rows.map((row) => row.id);
}

/**
 * @returns {Promise<object|null>} null si `day` no es válido.
 */
export async function getTodayActivity(db, viewer, { scope, day, now = Date.now() } = {}) {
  const tz = safeTimeZone(viewer?.timezone);
  const normalizedScope = normalizeScope(scope);
  const range = resolveTodayRange(day, now, tz);
  if (!range) return null;

  // Las fechas sueltas (?day=YYYY-MM-DD) no se cachean: son raras y no se
  // invalidarían al seguir a alguien.
  const cacheable = ['today', 'week'].includes(range.day) || day === 'yesterday';
  const run = (withForYou = true) => buildToday(db, viewer.id, { scope: normalizedScope, range, tz, nowMs: now, withForYou });

  if (normalizedScope === 'following') {
    if (!cacheable) return run();
    return withCache(todayCacheKey('following', viewer.id, day || 'today', tz), CACHE_TTL.following, run);
  }

  // Comunidad: lo de todos se cachea compartido; «Para ti» y a quién sigue el
  // que mira dependen de él y se calculan aparte.
  const [shared, forYou] = await Promise.all([
    cacheable
      ? withCache(todayCacheKey('community', viewer.id, day || 'today', tz), CACHE_TTL.community, () => run(false))
      : run(false),
    loadForYou(db, viewer.id, range, tz).catch(() => []),
  ]);
  return { ...shared, forYou, viewerFollows: await viewerFollowsAmong(db, viewer.id, shared?.actions) };
}
