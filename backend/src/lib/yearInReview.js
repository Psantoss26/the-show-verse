// src/lib/yearInReview.js
// Datos de "Tu año en The Show Verse". Reúne lo que el usuario hizo en un año
// (visionados, notas, colección, social y logros) y delega el cálculo en las
// reglas puras de yearInReviewCore.js.
//
// COSTE, de lo más barato a lo más caro (mismo patrón que neuralGraph.js):
//   1. FIRMA del estado del usuario (recuentos y fechas máximas). El resumen ya
//      calculado para esa firma se sirve desde Redis.
//   2. Metadatos de TMDb leídos de tmdb_cache extrayendo SOLO los campos que se
//      usan, en SQL (la ficha completa pesa KB por título).
//   3. Títulos sin metadatos o sin reparto: se piden a TMDb en tandas, con tope
//      de títulos y de tiempo. Si no da tiempo a todos, el resultado se guarda
//      poco tiempo para completarlo en la siguiente visita.

import crypto from 'node:crypto';
import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';

import {
  commentLikes,
  communityLists,
  favorites,
  follows,
  listLikes,
  tmdbCache,
  titleComments,
  userAchievements,
  userListItems,
  userLists,
  userRatings,
  users,
  watchHistory,
  watchlist,
} from '../db/schema.js';
import { cacheGet, cacheSet } from './redis.js';
import { getMediaMetadataMap } from '../utils/mediaMetadata.js';
import { ACHIEVEMENTS } from '../level/achievements.js';
import { YEAR_IN_REVIEW_VERSION, buildYearInReview, localParts, watchLocalParts } from './yearInReviewCore.js';

const CACHE_TTL_SECONDS = 6 * 60 * 60;
const PARTIAL_CACHE_TTL_SECONDS = 10 * 60;
const COMMUNITY_TTL_SECONDS = 60 * 60;
const CREDITS_TTL_DAYS = 30;
const FETCH_BATCH = 10;
const META_FETCH_MAX = 120;
const CREDITS_FETCH_MAX = 80;
const FETCH_BUDGET_MS = 5_000;
const HISTORY_LIMIT = 60_000;

const ACHIEVEMENTS_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

function titleKey(mediaType, tmdbId) {
  return `${mediaType === 'movie' ? 'movie' : 'tv'}:${tmdbId}`;
}

/** Año por defecto: el actual si ya tiene algo de actividad, si no el último con datos. */
export function pickDefaultYear(availableYears, now = new Date(), timeZone = 'UTC') {
  const current = localParts(now, timeZone)?.y ?? now.getUTCFullYear();
  const years = (availableYears || []).map((y) => y.year);
  if (years.includes(current)) return current;
  return years.find((y) => y < current) ?? current;
}

async function userTimeZone(db, userId) {
  const [row] = await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId)).limit(1);
  const tz = row?.timezone || 'Europe/Madrid';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'Europe/Madrid';
  }
}

async function stateStamp(db, userId) {
  const result = await db.execute(sql`
    select
      (select count(*) || '.' || coalesce(extract(epoch from max(created_at))::bigint, 0)
         from ${watchHistory} where user_id = ${userId}) as h,
      (select count(*) || '.' || coalesce(extract(epoch from max(updated_at))::bigint, 0)
         from ${userRatings} where user_id = ${userId}) as r,
      (select count(*) from ${favorites} where user_id = ${userId}) as f,
      (select count(*) from ${watchlist} where user_id = ${userId}) as w,
      (select count(*) from ${userLists} where user_id = ${userId}) as l,
      (select count(*) from ${follows} where following_id = ${userId} or follower_id = ${userId}) as s,
      (select count(*) from ${userAchievements} where user_id = ${userId}) as a,
      (select count(*) from ${titleComments} where user_id = ${userId}) as c
  `);
  const [row] = [...result];
  const raw = [YEAR_IN_REVIEW_VERSION, row?.h, row?.r, row?.f, row?.w, row?.l, row?.s, row?.a, row?.c].join('|');
  return crypto.createHash('sha1').update(raw).digest('base64url').slice(0, 16);
}

// Límites del año en la zona del usuario, calculados por Postgres.
function yearBounds(year, timeZone) {
  return {
    start: sql`make_timestamptz(${year}, 1, 1, 0, 0, 0, ${timeZone})`,
    end: sql`make_timestamptz(${year + 1}, 1, 1, 0, 0, 0, ${timeZone})`,
  };
}

async function loadHistory(db, userId) {
  return db
    .select({
      tmdbId: watchHistory.tmdbId,
      mediaType: watchHistory.mediaType,
      season: watchHistory.season,
      episode: watchHistory.episode,
      watchedAt: watchHistory.watchedAt,
      runtimeMins: watchHistory.runtimeMins,
      title: watchHistory.title,
      posterPath: watchHistory.posterPath,
      activityGroup: watchHistory.activityGroup,
    })
    .from(watchHistory)
    .where(eq(watchHistory.userId, userId))
    .orderBy(watchHistory.watchedAt)
    .limit(HISTORY_LIMIT);
}

async function loadRatings(db, userId) {
  return db
    .select({
      tmdbId: userRatings.tmdbId,
      mediaType: userRatings.mediaType,
      season: userRatings.season,
      episode: userRatings.episode,
      rating: userRatings.rating,
      ratedAt: userRatings.ratedAt,
      title: userRatings.title,
      posterPath: userRatings.posterPath,
    })
    .from(userRatings)
    .where(eq(userRatings.userId, userId));
}

async function countWhere(db, table, condition) {
  const [row] = await db.select({ n: sql`count(*)::int` }).from(table).where(condition);
  return Number(row?.n || 0);
}

// Altas del año en favoritos o pendientes SIN las importaciones (tres o más
// filas con el mismo instante exacto son una importación, no gestos del año).
async function countIndividualAdds(db, table, userId, start, end) {
  const result = await db.execute(sql`
    select count(*)::int as n from (
      select count(*) over (partition by added_at) as same
      from ${table}
      where user_id = ${userId} and added_at >= ${start} and added_at < ${end}
    ) rows where same < 3
  `);
  return Number([...result][0]?.n || 0);
}

async function loadActivity(db, userId, year, timeZone) {
  const { start, end } = yearBounds(year, timeZone);
  const inYear = (column) => and(gte(column, start), lt(column, end));

  const [
    favoritesAdded,
    watchlistAdded,
    listsCreated,
    listItemsAdded,
    comments,
    followersGained,
    followingAdded,
    commentLikesReceived,
    listLikesReceived,
  ] = await Promise.all([
    countIndividualAdds(db, favorites, userId, start, end),
    countIndividualAdds(db, watchlist, userId, start, end),
    countWhere(db, userLists, and(eq(userLists.userId, userId), inYear(userLists.createdAt))),
    db
      .select({ n: sql`count(*)::int` })
      .from(userListItems)
      .innerJoin(userLists, eq(userLists.id, userListItems.listId))
      .where(and(eq(userLists.userId, userId), inYear(userListItems.addedAt)))
      .then(([row]) => Number(row?.n || 0)),
    countWhere(db, titleComments, and(eq(titleComments.userId, userId), eq(titleComments.source, 'native'), inYear(titleComments.createdAt))),
    countWhere(db, follows, and(eq(follows.followingId, userId), inYear(follows.createdAt))),
    countWhere(db, follows, and(eq(follows.followerId, userId), inYear(follows.createdAt))),
    db
      .select({ n: sql`count(*)::int` })
      .from(commentLikes)
      .innerJoin(titleComments, eq(titleComments.id, commentLikes.commentId))
      .where(and(eq(titleComments.userId, userId), inYear(commentLikes.createdAt)))
      .then(([row]) => Number(row?.n || 0)),
    db
      .select({ n: sql`count(*)::int` })
      .from(listLikes)
      .innerJoin(communityLists, eq(communityLists.id, listLikes.listId))
      .innerJoin(userLists, eq(userLists.id, communityLists.userListId))
      .where(and(eq(userLists.userId, userId), inYear(listLikes.createdAt)))
      .then(([row]) => Number(row?.n || 0)),
  ]);

  return {
    favoritesAdded,
    watchlistAdded,
    listsCreated,
    listItemsAdded,
    comments,
    followersGained,
    followingAdded,
    likesReceived: commentLikesReceived + listLikesReceived,
  };
}

async function loadAchievements(db, userId, year, timeZone) {
  const { start, end } = yearBounds(year, timeZone);
  const rows = await db
    .select({ achievementId: userAchievements.achievementId, unlockedAt: userAchievements.unlockedAt })
    .from(userAchievements)
    .where(and(eq(userAchievements.userId, userId), gte(userAchievements.unlockedAt, start), lt(userAchievements.unlockedAt, end)))
    .orderBy(userAchievements.unlockedAt);
  const rarityOrder = { legendario: 0, epico: 1, raro: 2, comun: 3 };
  return rows
    .map((row) => {
      const def = ACHIEVEMENTS_BY_ID.get(row.achievementId);
      if (!def) return null;
      return {
        id: def.id,
        name: def.name,
        description: def.description,
        rarity: def.rarity,
        icon: def.icon,
        unlockedAt: row.unlockedAt,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (rarityOrder[a.rarity] ?? 9) - (rarityOrder[b.rarity] ?? 9));
}

// Posición del usuario por visionados del año entre todos los usuarios activos.
async function loadCommunityRank(db, userId, year, timeZone) {
  const cacheKey = `recap:community:${year}:${timeZone}`;
  let counts = await cacheGet(cacheKey);
  if (!counts) {
    const { start, end } = yearBounds(year, timeZone);
    const rows = await db
      .select({ userId: watchHistory.userId, n: sql`count(*)::int` })
      .from(watchHistory)
      .where(and(gte(watchHistory.watchedAt, start), lt(watchHistory.watchedAt, end)))
      .groupBy(watchHistory.userId);
    counts = Object.fromEntries(rows.map((row) => [row.userId, Number(row.n)]));
    await cacheSet(cacheKey, counts, COMMUNITY_TTL_SECONDS);
  }
  const mine = counts[userId];
  if (!mine) return null;
  const values = Object.values(counts);
  return {
    activeUsers: values.length,
    rank: 1 + values.filter((n) => n > mine).length,
  };
}

// ─────────────────────────────────────────────
// Metadatos de TMDb
// ─────────────────────────────────────────────

function pickSeasons(seasons) {
  const counts = {};
  if (!Array.isArray(seasons)) return counts;
  for (const season of seasons) {
    const number = Number(season?.season_number);
    const episodes = Number(season?.episode_count || 0);
    if (number > 0 && episodes > 0) counts[number] = episodes;
  }
  return counts;
}

function pickPerson(person) {
  if (!person?.id || !person?.name) return null;
  return { id: person.id, name: person.name, profilePath: person.profile_path || null };
}

function pickCredits(cast, directors, createdBy) {
  const castList = (Array.isArray(cast) ? cast : [])
    .slice()
    .sort((a, b) => Number(a?.order ?? 99) - Number(b?.order ?? 99))
    .slice(0, 8)
    .map(pickPerson)
    .filter(Boolean);
  const people = [...(Array.isArray(directors) ? directors : []), ...(Array.isArray(createdBy) ? createdBy : [])];
  const directorList = [];
  const seen = new Set();
  for (const person of people) {
    const picked = pickPerson(person);
    if (!picked || seen.has(picked.id)) continue;
    seen.add(picked.id);
    directorList.push(picked);
  }
  if (!castList.length && !directorList.length) return null;
  return { cast: castList, directors: directorList };
}

/** Recorta una ficha de TMDb (ya sea la fila SQL o el JSON completo) a lo que usa el resumen. */
export function pickRecapMeta(data) {
  if (!data) return null;
  const genres = Array.isArray(data.genres)
    ? data.genres.map((g) => (typeof g === 'string' ? g : g?.name)).filter(Boolean)
    : [];
  const countries = [
    ...(Array.isArray(data.production_countries) ? data.production_countries.map((c) => c?.iso_3166_1) : []),
    ...(Array.isArray(data.origin_country) ? data.origin_country : []),
  ].filter((code) => typeof code === 'string' && code.length === 2);
  const episodeRuntime = Array.isArray(data.episode_run_time)
    ? Number(data.episode_run_time.find((v) => Number(v) > 0) || 0)
    : 0;
  return {
    title: data.title || data.name || null,
    originalTitle: data.original_title || data.original_name || null,
    posterPath: data.poster_path || null,
    backdropPath: data.backdrop_path || null,
    runtime: Number(data.runtime || 0) || null,
    episodeRuntime: episodeRuntime || Number(data.last_episode_to_air?.runtime || 0) || null,
    genres,
    date: data.release_date || data.first_air_date || null,
    originalLanguage: data.original_language || null,
    countries: [...new Set(countries)],
    voteAverage: Number(data.vote_average || 0) || null,
    networks: Array.isArray(data.networks)
      ? data.networks.slice(0, 2).map((n) => ({ id: n.id, name: n.name, logoPath: n.logo_path || null }))
      : [],
    seasonEpisodeCounts: pickSeasons(data.seasons),
  };
}

async function loadCachedMeta(db, keys) {
  const meta = new Map();
  const credits = new Map();
  if (!keys.length) return { meta, credits };
  const cacheKeys = keys.flatMap((key) => [`bare:${key}`, `tmdb:${key}`, key, `credits:${key}`]);
  for (let i = 0; i < cacheKeys.length; i += 2000) {
    const chunk = cacheKeys.slice(i, i + 2000);
    const rows = await db
      .select({
        cacheKey: tmdbCache.cacheKey,
        data: sql`jsonb_build_object(
          'title', ${tmdbCache.data}->'title',
          'name', ${tmdbCache.data}->'name',
          'original_title', ${tmdbCache.data}->'original_title',
          'original_name', ${tmdbCache.data}->'original_name',
          'poster_path', ${tmdbCache.data}->'poster_path',
          'backdrop_path', ${tmdbCache.data}->'backdrop_path',
          'runtime', ${tmdbCache.data}->'runtime',
          'episode_run_time', ${tmdbCache.data}->'episode_run_time',
          'last_episode_to_air', jsonb_build_object('runtime', ${tmdbCache.data}->'last_episode_to_air'->'runtime'),
          'genres', ${tmdbCache.data}->'genres',
          'release_date', ${tmdbCache.data}->'release_date',
          'first_air_date', ${tmdbCache.data}->'first_air_date',
          'original_language', ${tmdbCache.data}->'original_language',
          'production_countries', ${tmdbCache.data}->'production_countries',
          'origin_country', ${tmdbCache.data}->'origin_country',
          'vote_average', ${tmdbCache.data}->'vote_average',
          'networks', ${tmdbCache.data}->'networks',
          'seasons', ${tmdbCache.data}->'seasons',
          'created_by', ${tmdbCache.data}->'created_by'
        )`,
        cast: sql`coalesce(
          jsonb_path_query_array(${tmdbCache.data}->'credits'->'cast', '$[0 to 11]'),
          jsonb_path_query_array(${tmdbCache.data}->'cast', '$[0 to 11]')
        )`,
        directors: sql`coalesce(
          jsonb_path_query_array(${tmdbCache.data}->'credits'->'crew', '$[*] ? (@.job == "Director")'),
          jsonb_path_query_array(${tmdbCache.data}->'directors', '$[*]')
        )`,
      })
      .from(tmdbCache)
      .where(inArray(tmdbCache.cacheKey, chunk));

    for (const row of rows) {
      const rawKey = String(row.cacheKey);
      const key = rawKey.replace(/^(bare|tmdb|credits):/, '');
      if (!rawKey.startsWith('credits:')) {
        const picked = pickRecapMeta(row.data);
        const current = meta.get(key);
        // Entre varias copias, la más completa (con géneros y temporadas).
        const richness = (m) => (m?.genres?.length ? 2 : 0) + (Object.keys(m?.seasonEpisodeCounts || {}).length ? 1 : 0) + (m?.originalLanguage ? 1 : 0);
        if (picked && (!current || richness(picked) > richness(current))) meta.set(key, picked);
      }
      const picked = pickCredits(row.cast, row.directors, row.data?.created_by);
      if (!picked) continue;
      const current = credits.get(key);
      if (!current) {
        credits.set(key, picked);
        continue;
      }
      // La copia `credits:` manda en el reparto; los creadores de una serie
      // solo vienen en la ficha, así que se conservan de cualquiera de las dos.
      const preferNew = rawKey.startsWith('credits:') || (!current.cast.length && picked.cast.length);
      const merged = preferNew ? { ...picked } : { ...current };
      if (!merged.directors.length) merged.directors = preferNew ? current.directors : picked.directors;
      credits.set(key, merged);
    }
  }
  return { meta, credits };
}

async function fetchMissingMeta(missing, meta, deadline) {
  for (let i = 0; i < missing.length && i < META_FETCH_MAX; i += FETCH_BATCH) {
    if (Date.now() > deadline) break;
    const batch = missing.slice(i, i + FETCH_BATCH);
    const data = await getMediaMetadataMap(batch).catch(() => new Map());
    for (const row of batch) {
      const picked = pickRecapMeta(data.get(titleKey(row.mediaType, row.tmdbId)));
      if (picked) meta.set(titleKey(row.mediaType, row.tmdbId), picked);
    }
  }
}

async function fetchCredits(db, key) {
  const [type, id] = key.split(':');
  const endpoint = type === 'movie' ? `movie/${id}/credits` : `tv/${id}/aggregate_credits`;
  const url = `https://api.themoviedb.org/3/${endpoint}?api_key=${process.env.TMDB_API_KEY}&language=es-ES`;
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) return null;
  const json = await res.json();
  const cast = Array.isArray(json?.cast) ? json.cast : [];
  const directors = (Array.isArray(json?.crew) ? json.crew : []).filter((p) => p?.job === 'Director' || p?.jobs?.some?.((j) => j?.job === 'Director'));
  const data = {
    cast: cast.slice(0, 12).map((p) => ({ id: p.id, name: p.name, profile_path: p.profile_path || null, order: p.order ?? 99 })),
    directors: type === 'movie' ? directors.slice(0, 3).map((p) => ({ id: p.id, name: p.name, profile_path: p.profile_path || null })) : [],
  };
  const now = new Date();
  await db
    .insert(tmdbCache)
    .values({ cacheKey: `credits:${key}`, data, fetchedAt: now, expiresAt: new Date(now.getTime() + CREDITS_TTL_DAYS * 86_400_000) })
    .onConflictDoUpdate({ target: tmdbCache.cacheKey, set: { data, fetchedAt: now } })
    .catch(() => {});
  return pickCredits(data.cast, data.directors, null);
}

async function fetchMissingCredits(db, keys, credits, meta, deadline) {
  const pending = keys.slice(0, CREDITS_FETCH_MAX);
  for (let i = 0; i < pending.length; i += FETCH_BATCH) {
    if (Date.now() > deadline) return pending.length - i;
    const batch = pending.slice(i, i + FETCH_BATCH);
    const results = await Promise.all(batch.map((key) => fetchCredits(db, key).catch(() => null)));
    batch.forEach((key, index) => {
      const picked = results[index];
      if (!picked) return;
      // Las series suelen traer a sus creadores en la ficha, no en el reparto.
      const existing = credits.get(key);
      if (!picked.directors.length && existing?.directors?.length) picked.directors = existing.directors;
      credits.set(key, picked);
    });
  }
  return Math.max(0, keys.length - pending.length);
}

/**
 * Resumen del año de un usuario. `year` null → el año por defecto.
 */
export async function getYearInReview(db, userId, { year = null, refresh = false, log = null } = {}) {
  const timeZone = await userTimeZone(db, userId);
  const stamp = await stateStamp(db, userId);

  const history = await loadHistory(db, userId);
  // Años disponibles sin calcular todo: basta con las fechas.
  const yearCounts = new Map();
  for (const row of history) {
    const y = watchLocalParts(row.watchedAt, timeZone)?.y;
    if (y) yearCounts.set(y, (yearCounts.get(y) || 0) + 1);
  }
  const availableYears = [...yearCounts.entries()].sort((a, b) => b[0] - a[0]).map(([y, plays]) => ({ year: y, plays }));
  const targetYear = Number.isInteger(year) ? year : pickDefaultYear(availableYears, new Date(), timeZone);

  const cacheKey = `recap:v${YEAR_IN_REVIEW_VERSION}:${userId}:${targetYear}:${stamp}`;
  if (!refresh) {
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;
  }

  const yearKeys = new Set();
  const contextKeys = new Set();
  const minutesByKey = new Map();
  for (const row of history) {
    const y = watchLocalParts(row.watchedAt, timeZone)?.y;
    const key = titleKey(row.mediaType, row.tmdbId);
    if (y === targetYear) {
      yearKeys.add(key);
      minutesByKey.set(key, (minutesByKey.get(key) || 0) + (Number(row.runtimeMins) || 45));
    } else if (y === targetYear - 1) {
      contextKeys.add(key);
    }
  }

  const [ratings, activity, achievements, community] = await Promise.all([
    loadRatings(db, userId),
    loadActivity(db, userId, targetYear, timeZone),
    loadAchievements(db, userId, targetYear, timeZone),
    loadCommunityRank(db, userId, targetYear, timeZone).catch(() => null),
  ]);
  // Los títulos puntuados en el año también necesitan póster y nota de TMDb.
  for (const rating of ratings) {
    if ((rating.mediaType === 'movie' || rating.mediaType === 'tv') && localParts(rating.ratedAt, timeZone)?.y === targetYear) {
      contextKeys.add(titleKey(rating.mediaType, rating.tmdbId));
    }
  }

  const keys = [...new Set([...yearKeys, ...contextKeys])];
  const { meta, credits } = await loadCachedMeta(db, keys);

  let pendingCredits = 0;
  if (process.env.TMDB_API_KEY) {
    const deadline = Date.now() + FETCH_BUDGET_MS;
    const missingMeta = keys
      .filter((key) => !meta.has(key))
      .sort((a, b) => (minutesByKey.get(b) || 0) - (minutesByKey.get(a) || 0))
      .map((key) => {
        const [mediaType, tmdbId] = key.split(':');
        return { mediaType, tmdbId: Number(tmdbId) };
      });
    await fetchMissingMeta(missingMeta, meta, deadline);

    // Reparto: primero los títulos que más tiempo se llevaron.
    const missingCredits = [...yearKeys]
      .filter((key) => !credits.get(key)?.cast?.length)
      .sort((a, b) => (minutesByKey.get(b) || 0) - (minutesByKey.get(a) || 0));
    pendingCredits = await fetchMissingCredits(db, missingCredits, credits, meta, deadline);
  }

  const result = buildYearInReview({
    year: targetYear,
    timeZone,
    history,
    ratings,
    meta,
    credits,
    activity,
    achievements,
    community,
  });
  result.availableYears = availableYears;
  result.partial = pendingCredits > 0 || [...yearKeys].some((key) => !meta.has(key));

  await cacheSet(cacheKey, result, result.partial ? PARTIAL_CACHE_TTL_SECONDS : CACHE_TTL_SECONDS);
  if (result.partial) log?.info?.({ userId, year: targetYear, pendingCredits }, '[recap] resumen parcial');
  return result;
}
