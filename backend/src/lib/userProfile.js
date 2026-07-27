// src/lib/userProfile.js
// Lógica de perfiles sociales (Phases 1 y 2). Las funciones PURAS (sin BD) se
// exportan aparte para poder testearlas con node:test; `buildUserProfile` y los
// lectores de sección (`getUser*`) hacen las consultas que consume /u/[username].

import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import {
  users,
  follows,
  profileFavorites,
  watchHistory,
  userRatings,
  watchlist,
  favorites,
  userLists,
  userListItems,
  titleComments,
  tmdbCache,
} from '../db/schema.js';
import { getTitlePoster } from './tmdbPoster.js';
import { getMediaMetadataMap, metadataFor } from '../utils/mediaMetadata.js';
import { computeShowProgress } from './showProgress.js';

const RECENT_WATCHED_SCAN = 40; // filas a escanear para deduplicar por título
const RECENT_WATCHED_LIMIT = 5;
const WATCHLIST_PREVIEW_LIMIT = 5;
const FOLLOWING_PREVIEW_LIMIT = 12;
export const PROFILE_FAVORITES_MAX = 5;
export const PROFILE_FAVORITES_TOTAL_MAX = PROFILE_FAVORITES_MAX * 2;
const LIST_PREVIEW_LIMIT = 5;
const PROFILE_ANALYTICS_HISTORY_LIMIT = 1500;
const DEFAULT_MOVIE_RUNTIME_MINS = 100;
const DEFAULT_EPISODE_RUNTIME_MINS = 45;
const PROFILE_COMPLETED_SHOWS_HISTORY_LIMIT = 5000;
const PROFILE_ENGLISH_POSTER_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const PROFILE_ENGLISH_POSTER_FETCH_CONCURRENCY = 8;
const profileEnglishPosterMemory = new Map();

// Normaliza limit/offset de una sección paginada (cotas defensivas).
export function pageParams({ limit, offset } = {}) {
  return {
    limit: Math.min(60, Math.max(1, Number(limit) || 30)),
    offset: Math.max(0, Number(offset) || 0),
  };
}

// Empaqueta una página: pide `limit+1` para saber si hay más sin un COUNT extra.
export function packPage(rows, limit, offset) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, hasMore, offset: offset + items.length };
}

// ─────────────────────────────────────────────
// PURE HELPERS (testeables sin BD)
// ─────────────────────────────────────────────

// Clave estable de un título para deduplicar/relacionar (mismo criterio que en
// el frontend: `mediaType:tmdbId`).
export function titleKey(mediaType, tmdbId) {
  return `${mediaType}:${Number(tmdbId)}`;
}

function profileEnglishPosterCacheKey(mediaType, tmdbId) {
  return `profile:english-poster:${titleKey(mediaType, tmdbId)}`;
}

function pickHighestQualityPoster(posters) {
  if (!posters.length) return null;
  const maxVotes = Math.max(...posters.map((poster) => Number(poster.vote_count) || 0));
  return [...posters]
    .filter((poster) => (Number(poster.vote_count) || 0) === maxVotes)
    .sort((a, b) => {
      const voteAverage = (Number(b.vote_average) || 0) - (Number(a.vote_average) || 0);
      if (voteAverage) return voteAverage;
      return (Number(b.width) || 0) - (Number(a.width) || 0);
    })[0] || null;
}

// Mismo criterio de DetailsClient: inglés, luego arte sin idioma y, por último,
// cualquier alternativa que no sea española. Se exporta para cubrir el criterio
// sin requerir red en los tests.
export function pickBestEnglishPosterPath(posters) {
  const valid = Array.isArray(posters)
    ? posters.filter((poster) => typeof poster?.file_path === 'string' && poster.file_path)
    : [];
  const languageOf = (poster) => String(poster?.iso_639_1 || '').toLowerCase();
  const english = valid.filter((poster) => ['en', 'en-us'].includes(languageOf(poster)));
  const neutral = valid.filter((poster) => !poster?.iso_639_1);
  const nonSpanish = valid.filter((poster) => !['es', 'es-es'].includes(languageOf(poster)));
  const best = pickHighestQualityPoster(english.length ? english : neutral.length ? neutral : nonSpanish);
  return best?.file_path || null;
}

export function applyResolvedEnglishPosterPaths(
  items,
  resolvedPosters,
  { strict = false } = {},
) {
  const resolved =
    resolvedPosters instanceof Map ? resolvedPosters : new Map();
  return (Array.isArray(items) ? items : []).map((item) => {
    const key = titleKey(item?.mediaType, item?.tmdbId);
    if (resolved.has(key)) {
      return { ...item, posterPath: resolved.get(key) || null };
    }
    return strict ? { ...item, posterPath: null } : item;
  });
}

async function mapWithConcurrency(values, worker, concurrency = PROFILE_ENGLISH_POSTER_FETCH_CONCURRENCY) {
  const results = new Array(values.length);
  let nextIndex = 0;
  const run = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(values[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, run));
  return results;
}

export async function resolveEnglishPosterPaths(db, items) {
  const entries = [...new Map(
    (items || [])
      .filter((item) => Number(item?.tmdbId) && ['movie', 'tv'].includes(item?.mediaType))
      .map((item) => [titleKey(item.mediaType, item.tmdbId), item]),
  ).values()];
  if (!entries.length) return new Map();

  const now = new Date();
  const resolved = new Map();
  const cacheKeys = entries.map((item) => profileEnglishPosterCacheKey(item.mediaType, item.tmdbId));
  for (const item of entries) {
    const key = titleKey(item.mediaType, item.tmdbId);
    const memory = profileEnglishPosterMemory.get(key);
    if (memory?.expiresAt > now) resolved.set(key, memory.posterPath);
  }

  try {
    const cachedRows = await db
      .select({ cacheKey: tmdbCache.cacheKey, data: tmdbCache.data, expiresAt: tmdbCache.expiresAt })
      .from(tmdbCache)
      .where(inArray(tmdbCache.cacheKey, cacheKeys));
    for (const row of cachedRows) {
      const entry = entries.find((item) => profileEnglishPosterCacheKey(item.mediaType, item.tmdbId) === row.cacheKey);
      const posterPath = row?.data?.posterPath;
      const expiresAt = new Date(row.expiresAt);
      const hasPosterDecision = Object.hasOwn(row?.data || {}, 'posterPath');
      if (!entry || Number.isNaN(expiresAt.getTime()) || expiresAt <= now || !hasPosterDecision) continue;
      const key = titleKey(entry.mediaType, entry.tmdbId);
      resolved.set(key, posterPath);
      profileEnglishPosterMemory.set(key, { posterPath, expiresAt });
    }
  } catch {
    // La caché es una optimización: un fallo de lectura no bloquea el perfil.
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return resolved;
  const missing = entries.filter((item) => !resolved.has(titleKey(item.mediaType, item.tmdbId)));
  const expiresAt = new Date(now.getTime() + PROFILE_ENGLISH_POSTER_TTL_MS);
  await mapWithConcurrency(missing, async (item) => {
    const key = titleKey(item.mediaType, item.tmdbId);
    let posterPath = null;
    let settled = false;
    try {
      const response = await fetch(
        `https://api.themoviedb.org/3/${item.mediaType}/${item.tmdbId}/images?api_key=${apiKey}&include_image_language=en,null`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (response.ok) {
        const payload = await response.json();
        posterPath = pickBestEnglishPosterPath(payload?.posters);
        settled = true;
      }
    } catch {
      // Se conserva el póster de historial si TMDb no está disponible.
    }
    if (!settled) return null;

    resolved.set(key, posterPath);
    profileEnglishPosterMemory.set(key, { posterPath, expiresAt });
    await db
      .insert(tmdbCache)
      .values({
        cacheKey: profileEnglishPosterCacheKey(item.mediaType, item.tmdbId),
        data: { posterPath },
        fetchedAt: now,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: tmdbCache.cacheKey,
        set: { data: { posterPath }, fetchedAt: now, expiresAt },
      })
      .catch(() => {});
    return posterPath;
  });

  return resolved;
}

// ¿Puede `followerId` seguir a `followingId`? No a uno mismo, ambos requeridos.
export function canFollow(followerId, followingId) {
  return Boolean(followerId) && Boolean(followingId) && followerId !== followingId;
}

// Histograma de puntuaciones en 10 barras (1..10) al estilo del panel de stats.
// Cada nota real (1-10) se redondea a su entero más cercano y se acota a [1,10].
export function buildRatingHistogram(ratingValues) {
  const buckets = Array.from({ length: 10 }, () => 0);
  for (const raw of Array.isArray(ratingValues) ? ratingValues : []) {
    const value = Number(raw);
    // Solo cuentan notas reales (1-10). Un 0/null/NaN o algo fuera de rango NO
    // se acota dentro de un cubo: se ignora, para no inflar la primera barra.
    if (!Number.isFinite(value) || value < 1 || value > 10) continue;
    const idx = Math.round(value) - 1;
    buckets[idx] += 1;
  }
  return buckets;
}

// Deduplica filas de historial (ya ordenadas por watchedAt desc) por título,
// conservando la primera aparición (la más reciente), hasta `limit`.
export function dedupeRecentWatched(rows, limit = RECENT_WATCHED_LIMIT) {
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row?.tmdbId == null || !row?.mediaType) continue;
    const key = titleKey(row.mediaType, row.tmdbId);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

// «Marcar serie» crea una fila de historial por episodio para conservar el
// progreso. Todas comparten activityGroup y se leen como una única actividad.
export function collapseGroupedWatchActivity(rows) {
  const singles = [];
  const grouped = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row?.activityGroup) {
      singles.push(row);
      continue;
    }
    if (!grouped.has(row.activityGroup)) {
      grouped.set(row.activityGroup, {
        ...row,
        season: null,
        episode: null,
        completedShow: true,
      });
    }
  }

  return [...singles, ...grouped.values()];
}

// Valida y normaliza la selección curada de favoritos del perfil: descarta
// entradas mal formadas, deduplica por título, recorta a `max` y reasigna
// `position` 0..n según el orden recibido. Cuando se recibe `mediaType`, la
// selección queda limitada a esa fila (películas o series).
export function normalizeProfileFavorites(items, max = PROFILE_FAVORITES_MAX, mediaType = null) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(items) ? items : []) {
    const tmdbId = Number(raw?.tmdbId);
    if (!Number.isInteger(tmdbId) || tmdbId <= 0) continue;
    const itemMediaType = raw?.mediaType;
    if (itemMediaType !== 'movie' && itemMediaType !== 'tv') continue;
    if (mediaType && itemMediaType !== mediaType) continue;
    const key = titleKey(itemMediaType, tmdbId);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      tmdbId,
      mediaType: itemMediaType,
      title: typeof raw.title === 'string' ? raw.title.slice(0, 512) : null,
      posterPath:
        typeof raw.posterPath === 'string' && raw.posterPath.startsWith('/')
          ? raw.posterPath
          : null,
      position: out.length,
    });
    if (out.length >= max) break;
  }
  return out;
}

// Cuenta series realmente terminadas usando el mismo criterio que la página
// Completadas: todos los episodios emitidos conocidos deben tener al menos un
// visionado. Los rewatches se contabilizan como plays adicionales, no como
// nuevas series completadas.
export function countCompletedShows(rows, metadataByKey) {
  const playsByShow = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const tmdbId = Number(row?.tmdbId);
    const season = Number(row?.season);
    const episode = Number(row?.episode);
    if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !Number.isInteger(season) || season <= 0 || !Number.isInteger(episode) || episode <= 0) continue;

    const playCounts = playsByShow.get(tmdbId) || new Map();
    const episodeKey = `${season}-${episode}`;
    playCounts.set(episodeKey, (playCounts.get(episodeKey) || 0) + 1);
    playsByShow.set(tmdbId, playCounts);
  }

  let completed = 0;
  for (const [tmdbId, playCounts] of playsByShow) {
    const metadata = metadataByKey?.get(`tmdb:tv:${tmdbId}`)
      || metadataByKey?.get(`tv:${tmdbId}`)
      || {};
    const seasonEpisodeCounts = {};
    for (const season of Array.isArray(metadata.seasons) ? metadata.seasons : []) {
      const seasonNumber = Number(season?.season_number);
      const episodeCount = Number(season?.episode_count || 0);
      if (seasonNumber > 0 && episodeCount > 0) seasonEpisodeCounts[seasonNumber] = episodeCount;
    }
    if (computeShowProgress(playCounts, seasonEpisodeCounts).baseComplete) completed += 1;
  }
  return completed;
}

function mediaCacheKeys(mediaType, tmdbId) {
  const media = mediaType === 'movie' ? 'movie' : 'tv';
  return [`tmdb:${media}:${tmdbId}`, `${media}:${tmdbId}`];
}

async function getCompletedShowsCount(db, targetId) {
  const rows = await db
    .select({
      tmdbId: watchHistory.tmdbId,
      season: watchHistory.season,
      episode: watchHistory.episode,
    })
    .from(watchHistory)
    .where(
      and(
        eq(watchHistory.userId, targetId),
        eq(watchHistory.mediaType, 'tv'),
        isNotNull(watchHistory.season),
        isNotNull(watchHistory.episode),
      ),
    )
    .orderBy(desc(watchHistory.watchedAt))
    .limit(PROFILE_COMPLETED_SHOWS_HISTORY_LIMIT);
  if (!rows.length) return 0;

  const cacheKeys = [...new Set(rows.flatMap((row) => mediaCacheKeys('tv', row.tmdbId)))];
  const cachedRows = cacheKeys.length
    ? await db
      .select({ cacheKey: tmdbCache.cacheKey, data: tmdbCache.data })
      .from(tmdbCache)
      .where(inArray(tmdbCache.cacheKey, cacheKeys))
    : [];
  const metadataByKey = new Map(cachedRows.map((row) => [row.cacheKey, row.data || {}]));
  return countCompletedShows(rows, metadataByKey);
}

function publicMonthLabel(date) {
  return new Intl.DateTimeFormat('es-ES', { month: 'short' })
    .format(date)
    .replace('.', '');
}

function ratingDistribution(values) {
  const distribution = {};
  for (const raw of values || []) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 1 || value > 10) continue;
    const key = String(Math.round(value * 2) / 2).replace(/\.0$/, '');
    distribution[key] = (distribution[key] || 0) + 1;
  }
  return distribution;
}

// Métricas públicas ya agregadas. El perfil social nunca recibe eventos de
// visionado individuales: solo los conjuntos necesarios para las gráficas.
async function buildPublicProfileAnalytics(db, targetId, ratingValues) {
  const history = await db
    .select({
      tmdbId: watchHistory.tmdbId,
      mediaType: watchHistory.mediaType,
      season: watchHistory.season,
      episode: watchHistory.episode,
      watchedAt: watchHistory.watchedAt,
      runtimeMins: watchHistory.runtimeMins,
    })
    .from(watchHistory)
    .where(eq(watchHistory.userId, targetId))
    .orderBy(desc(watchHistory.watchedAt))
    .limit(PROFILE_ANALYTICS_HISTORY_LIMIT);

  const cacheKeys = [...new Set(history.flatMap((row) => mediaCacheKeys(row.mediaType, row.tmdbId)))];
  const cachedRows = cacheKeys.length
    ? await db
        .select({ cacheKey: tmdbCache.cacheKey, data: tmdbCache.data })
        .from(tmdbCache)
        .where(inArray(tmdbCache.cacheKey, cacheKeys))
    : [];
  const metadata = new Map(cachedRows.map((row) => [row.cacheKey, row.data || {}]));

  const now = new Date();
  const months = new Map();
  for (let index = 11; index >= 0; index -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1));
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    months.set(key, { date: key, label: publicMonthLabel(date), movies: 0, episodes: 0, total: 0 });
  }

  const dayOfWeek = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((name) => ({ name, value: 0 }));
  const hourOfDay = Array.from({ length: 24 }, (_, hour) => ({ name: `${hour}h`, value: 0 }));
  const dayKeys = new Set();
  const genreCounts = {};
  const watchedShows = new Set();
  const currentMonthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const thisMonth = { movies: 0, episodes: 0, total: 0, minutes: 0 };
  let movieMinutes = 0;
  let episodeMinutes = 0;

  for (const row of history) {
    const watchedAt = new Date(row.watchedAt);
    if (Number.isNaN(watchedAt.getTime()) || watchedAt > now) continue;

    const key = `${watchedAt.getUTCFullYear()}-${String(watchedAt.getUTCMonth() + 1).padStart(2, '0')}`;
    const month = months.get(key);
    if (month) {
      if (row.mediaType === 'movie') month.movies += 1;
      else month.episodes += 1;
      month.total += 1;
    }
    dayOfWeek[watchedAt.getUTCDay()].value += 1;
    hourOfDay[watchedAt.getUTCHours()].value += 1;
    dayKeys.add(`${watchedAt.getUTCFullYear()}-${String(watchedAt.getUTCMonth() + 1).padStart(2, '0')}-${String(watchedAt.getUTCDate()).padStart(2, '0')}`);

    const fallbackRuntime = row.mediaType === 'movie'
      ? DEFAULT_MOVIE_RUNTIME_MINS
      : row.season != null && row.episode != null
        ? DEFAULT_EPISODE_RUNTIME_MINS
        : 0;
    const runtime = Math.max(0, Number(row.runtimeMins || fallbackRuntime));
    if (row.mediaType === 'movie') movieMinutes += runtime;
    else {
      episodeMinutes += runtime;
      watchedShows.add(row.tmdbId);
    }
    if (key === currentMonthKey) {
      if (row.mediaType === 'movie') thisMonth.movies += 1;
      else thisMonth.episodes += 1;
      thisMonth.total += 1;
      thisMonth.minutes += runtime;
    }

    const cached = metadata.get(`tmdb:${row.mediaType === 'movie' ? 'movie' : 'tv'}:${row.tmdbId}`)
      || metadata.get(`${row.mediaType === 'movie' ? 'movie' : 'tv'}:${row.tmdbId}`)
      || {};
    for (const genre of Array.isArray(cached.genres) ? cached.genres : []) {
      const name = typeof genre === 'string' ? genre : genre?.name;
      if (name) genreCounts[name] = (genreCounts[name] || 0) + 1;
    }
  }

  const sortedDays = [...dayKeys].sort();
  let bestStreak = 0;
  let currentRun = 0;
  let previous = null;
  for (const key of sortedDays) {
    const time = new Date(`${key}T12:00:00Z`).getTime();
    currentRun = previous != null && time - previous === 86400000 ? currentRun + 1 : 1;
    bestStreak = Math.max(bestStreak, currentRun);
    previous = time;
  }
  const dateKey = (date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  const streakCursor = new Date(now);
  if (!dayKeys.has(dateKey(streakCursor))) streakCursor.setUTCDate(streakCursor.getUTCDate() - 1);
  let currentStreak = 0;
  while (dayKeys.has(dateKey(streakCursor))) {
    currentStreak += 1;
    streakCursor.setUTCDate(streakCursor.getUTCDate() - 1);
  }

  const ratings = ratingDistribution(ratingValues);
  const totalRatings = Object.values(ratings).reduce((sum, value) => sum + value, 0);
  const averageRating = totalRatings
    ? Object.entries(ratings).reduce((sum, [score, amount]) => sum + Number(score) * amount, 0) / totalRatings
    : null;
  const monthlyActivity = [...months.values()];
  const topDay = dayOfWeek.reduce((best, item) => item.value > (best?.value || 0) ? item : best, null);
  const peakHour = hourOfDay.reduce((best, item) => item.value > (best?.value || 0) ? item : best, null);
  const genres = Object.entries(genreCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
  const bestMonth = monthlyActivity.reduce((best, item) => item.total > (best?.total || 0) ? item : best, null);
  const totalActivity = monthlyActivity.reduce((sum, item) => sum + item.total, 0);

  return {
    totalMinutes: movieMinutes + episodeMinutes,
    shows: watchedShows.size,
    formattedTotalTime: `${Math.floor((movieMinutes + episodeMinutes) / 60)}h ${(movieMinutes + episodeMinutes) % 60}m`,
    thisMonth,
    monthlyActivity,
    timeDistribution: [
      { name: 'Películas', value: movieMinutes, color: '#3b82f6' },
      { name: 'Series', value: episodeMinutes, color: '#a855f7' },
    ],
    dayOfWeek,
    hourOfDay,
    genres,
    ratings: Object.entries(ratings)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => Number(a.name) - Number(b.name)),
    insights: {
      currentStreak,
      bestStreak,
      averageRating,
      topGenre: genres[0] || null,
      topDay: topDay?.value ? topDay : null,
      peakHour: peakHour?.value ? peakHour : null,
      bestMonth: bestMonth?.total ? bestMonth : null,
      weeklyAverage: totalActivity ? Math.round((totalActivity / 52) * 10) / 10 : 0,
    },
  };
}

// ─────────────────────────────────────────────
// DB HELPERS
// ─────────────────────────────────────────────

const PUBLIC_USER_COLUMNS = {
  id: users.id,
  username: users.username,
  displayName: users.displayName,
  avatarUrl: users.avatarUrl,
  bio: users.bio,
  createdAt: users.createdAt,
};

// Resuelve un usuario por username (case-insensitive) a sus columnas públicas.
export async function findUserByUsername(db, username) {
  if (!username) return null;
  const [row] = await db
    .select(PUBLIC_USER_COLUMNS)
    .from(users)
    .where(and(eq(sql`lower(${users.username})`, String(username).toLowerCase()), eq(users.isActive, true)))
    .limit(1);
  return row || null;
}

// ¿`viewerId` sigue a `targetId`?
export async function isFollowing(db, viewerId, targetId) {
  if (!viewerId || !targetId || viewerId === targetId) return false;
  const [row] = await db
    .select({ id: follows.id })
    .from(follows)
    .where(and(eq(follows.followerId, viewerId), eq(follows.followingId, targetId)))
    .limit(1);
  return Boolean(row);
}

// Agrega el perfil público de `targetUserId` visto por `viewerId` (opcional).
export async function buildUserProfile(db, targetUser, viewerId = null) {
  const targetId = targetUser.id;
  const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));

  const [
    filmsRows,
    thisYearRows,
    episodesRows,
    completedShows,
    followersRows,
    followingRows,
    totalRatingsRows,
    favoriteRows,
    recentRows,
    ratingValueRows,
    pendingPreviewRows,
    followingPreviewRows,
    followingState,
    sectionCounts,
  ] = await Promise.all([
    // Películas vistas (títulos de película únicos).
    db
      .select({ n: sql`COUNT(DISTINCT ${watchHistory.tmdbId})`.mapWith(Number) })
      .from(watchHistory)
      .where(and(eq(watchHistory.userId, targetId), eq(watchHistory.mediaType, 'movie'))),
    // Películas vistas este año.
    db
      .select({ n: sql`COUNT(DISTINCT ${watchHistory.tmdbId})`.mapWith(Number) })
      .from(watchHistory)
      .where(
        and(
          eq(watchHistory.userId, targetId),
          eq(watchHistory.mediaType, 'movie'),
          gte(watchHistory.watchedAt, yearStart),
        ),
      ),
    // Episodios de serie vistos.
    db
      .select({ n: count() })
      .from(watchHistory)
      .where(
        and(
          eq(watchHistory.userId, targetId),
          eq(watchHistory.mediaType, 'tv'),
          isNotNull(watchHistory.season),
          isNotNull(watchHistory.episode),
        ),
      ),
    // Series completadas: comparte el criterio de progreso de /completed.
    getCompletedShowsCount(db, targetId),
    db.select({ n: count() }).from(follows).where(eq(follows.followingId, targetId)),
    db.select({ n: count() }).from(follows).where(eq(follows.followerId, targetId)),
    db.select({ n: count() }).from(userRatings).where(eq(userRatings.userId, targetId)),
    // Favoritos curados (≤5 películas y ≤5 series, por posición).
    db
      .select()
      .from(profileFavorites)
      .where(eq(profileFavorites.userId, targetId))
      .orderBy(profileFavorites.position)
      .limit(PROFILE_FAVORITES_TOTAL_MAX),
    // Historial reciente (se deduplica por título después).
    db
      .select()
      .from(watchHistory)
      .where(eq(watchHistory.userId, targetId))
      .orderBy(desc(watchHistory.watchedAt))
      .limit(RECENT_WATCHED_SCAN),
    // Notas para el histograma.
    db.select({ rating: userRatings.rating }).from(userRatings).where(eq(userRatings.userId, targetId)),
    // Últimos títulos añadidos a Pendientes para la vista previa lateral.
    db
      .select({
        tmdbId: watchlist.tmdbId,
        mediaType: watchlist.mediaType,
        title: watchlist.title,
        posterPath: watchlist.posterPath,
        addedAt: watchlist.addedAt,
      })
      .from(watchlist)
      .where(eq(watchlist.userId, targetId))
      .orderBy(desc(watchlist.addedAt))
      .limit(WATCHLIST_PREVIEW_LIMIT),
    // Avatares de "siguiendo" para la tira del perfil.
    db
      .select({
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(follows)
      .innerJoin(users, eq(users.id, follows.followingId))
      .where(eq(follows.followerId, targetId))
      .orderBy(desc(follows.createdAt))
      .limit(FOLLOWING_PREVIEW_LIMIT),
    isFollowing(db, viewerId, targetId),
    // Conteos de las secciones (Phase 2) para la barra de pestañas.
    buildSectionCounts(db, targetId, { includePrivateLists: Boolean(viewerId && viewerId === targetId) }),
  ]);

  const recentWatched = dedupeRecentWatched(recentRows, RECENT_WATCHED_LIMIT);
  const analytics = await buildPublicProfileAnalytics(
    db,
    targetId,
    ratingValueRows.map((row) => row.rating),
  );

  // Notas del usuario para los títulos vistos recientemente.
  let ratingByKey = new Map();
  if (recentWatched.length) {
    const ids = [...new Set(recentWatched.map((r) => Number(r.tmdbId)))];
    const ratingRows = await db
      .select({
        tmdbId: userRatings.tmdbId,
        mediaType: userRatings.mediaType,
        rating: userRatings.rating,
      })
      .from(userRatings)
      .where(
        and(
          eq(userRatings.userId, targetId),
          inArray(userRatings.tmdbId, ids),
          inArray(userRatings.mediaType, ['movie', 'tv']),
        ),
      );
    ratingByKey = new Map(
      ratingRows.map((r) => [titleKey(r.mediaType, r.tmdbId), Number(r.rating)]),
    );
  }

  // "Últimos visionados" del perfil: mismo problema de póster ausente que la
  // pestaña Visionados → se rellena desde otras tablas / TMDb.
  const recentWatchedItems = recentWatched.map((r) => ({
    tmdbId: r.tmdbId,
    mediaType: r.mediaType,
    title: r.title,
    posterPath: r.posterPath,
    watchedAt: r.watchedAt,
    rating: ratingByKey.get(titleKey(r.mediaType, r.tmdbId)) ?? null,
  }));
  await fillMissingPosters(db, targetId, recentWatchedItems);

  const pendingPreview = pendingPreviewRows.map((item) => ({
    tmdbId: item.tmdbId,
    mediaType: item.mediaType,
    title: item.title,
    posterPath: item.posterPath,
    addedAt: item.addedAt,
  }));
  await fillMissingPosters(db, targetId, pendingPreview);

  const serializeProfileFavorite = (favorite) => ({
    tmdbId: favorite.tmdbId,
    mediaType: favorite.mediaType,
    title: favorite.title,
    posterPath: favorite.posterPath,
  });
  const favoriteMovies = normalizeProfileFavorites(
    favoriteRows.filter((favorite) => favorite.mediaType === 'movie'),
    PROFILE_FAVORITES_MAX,
    'movie',
  ).map(serializeProfileFavorite);
  const favoriteSeries = normalizeProfileFavorites(
    favoriteRows.filter((favorite) => favorite.mediaType === 'tv'),
    PROFILE_FAVORITES_MAX,
    'tv',
  ).map(serializeProfileFavorite);

  return {
    user: {
      id: targetUser.id,
      username: targetUser.username,
      displayName: targetUser.displayName || targetUser.username,
      avatarUrl: targetUser.avatarUrl || null,
      bio: targetUser.bio || null,
      memberSince: targetUser.createdAt || null,
    },
    isSelf: Boolean(viewerId && viewerId === targetId),
    isFollowing: Boolean(followingState),
    counts: {
      films: filmsRows[0]?.n || 0,
      thisYear: thisYearRows[0]?.n || 0,
      followers: followersRows[0]?.n || 0,
      following: followingRows[0]?.n || 0,
    },
    // `favorites` se conserva para clientes anteriores; los nuevos clientes
    // consumen las dos filas explícitas para no mezclar películas y series.
    favorites: [...favoriteMovies, ...favoriteSeries].slice(0, PROFILE_FAVORITES_MAX),
    favoriteMovies,
    favoriteSeries,
    recentWatched: recentWatchedItems,
    pendingPreview,
    followingPreview: followingPreviewRows.map((u) => ({
      username: u.username,
      displayName: u.displayName || u.username,
      avatarUrl: u.avatarUrl || null,
    })),
    stats: {
      films: filmsRows[0]?.n || 0,
      episodes: episodesRows[0]?.n || 0,
      completedShows,
      thisYear: thisYearRows[0]?.n || 0,
      totalRatings: totalRatingsRows[0]?.n || 0,
      ratingHistogram: buildRatingHistogram(ratingValueRows.map((r) => r.rating)),
    },
    analytics,
    // Conteos por sección para las pestañas del perfil (Phase 2).
    sections: sectionCounts,
  };
}

// ─────────────────────────────────────────────
// SECCIONES (Phase 2): conteos + lectores paginados por usuario
// ─────────────────────────────────────────────

// Conteos de cada sección para la barra de pestañas.
export async function buildSectionCounts(db, targetId, { includePrivateLists = false } = {}) {
  const distinctWatched = sql`COUNT(DISTINCT (${watchHistory.mediaType} || ':' || ${watchHistory.tmdbId}))`.mapWith(Number);
  const listVisibility = includePrivateLists
    ? eq(userLists.userId, targetId)
    : and(eq(userLists.userId, targetId), eq(userLists.isPublic, true));
  const [reviews, watched, watchlistC, favoritesC, ratingsC, listsC, activitySources] = await Promise.all([
    db
      .select({ n: count() })
      .from(titleComments)
      .where(and(eq(titleComments.userId, targetId), eq(titleComments.source, 'native'))),
    db.select({ n: distinctWatched }).from(watchHistory).where(eq(watchHistory.userId, targetId)),
    db.select({ n: count() }).from(watchlist).where(eq(watchlist.userId, targetId)),
    db.select({ n: count() }).from(favorites).where(eq(favorites.userId, targetId)),
    // Puntuaciones a nivel título (no episodios): lo que muestra la sección.
    db
      .select({ n: count() })
      .from(userRatings)
      .where(
        and(
          eq(userRatings.userId, targetId),
          inArray(userRatings.mediaType, ['movie', 'tv']),
          isNull(userRatings.season),
          isNull(userRatings.episode),
        ),
      ),
    db
      .select({ n: count() })
      .from(userLists)
      .where(listVisibility),
    Promise.all([
      db.select({ n: count() }).from(titleComments).where(and(eq(titleComments.userId, targetId), eq(titleComments.source, 'native'))),
      db
        .select({
          n: sql`count(distinct coalesce(${watchHistory.activityGroup}, ${watchHistory.id}::text))`,
        })
        .from(watchHistory)
        .where(eq(watchHistory.userId, targetId)),
      db.select({ n: count() }).from(watchlist).where(eq(watchlist.userId, targetId)),
      db.select({ n: count() }).from(favorites).where(eq(favorites.userId, targetId)),
      db.select({ n: count() }).from(userRatings).where(eq(userRatings.userId, targetId)),
      db.select({ n: count() }).from(userLists).where(listVisibility),
      db
        .select({ n: count() })
        .from(userListItems)
        .innerJoin(userLists, eq(userLists.id, userListItems.listId))
        .where(listVisibility),
    ]),
  ]);
  return {
    reviews: reviews[0]?.n || 0,
    watched: watched[0]?.n || 0,
    watchlist: watchlistC[0]?.n || 0,
    favorites: favoritesC[0]?.n || 0,
    ratings: ratingsC[0]?.n || 0,
    lists: listsC[0]?.n || 0,
    activity: activitySources.reduce((total, rows) => total + Number(rows[0]?.n || 0), 0),
  };
}

// Metadatos (título/póster) cacheados en las tablas del usuario para un conjunto
// de títulos. `title_comments` no cachea esos datos, así que se resuelven desde
// favorites/watch_history/user_ratings/watchlist para el mismo tmdb_id.
async function resolveTitleMetadata(db, targetId, keys) {
  const ids = [...new Set(keys.map((k) => Number(k.tmdbId)))].filter(Boolean);
  if (!ids.length) return new Map();
  const sources = [
    db.select({ tmdbId: favorites.tmdbId, mediaType: favorites.mediaType, title: favorites.title, posterPath: favorites.posterPath }).from(favorites).where(and(eq(favorites.userId, targetId), inArray(favorites.tmdbId, ids))),
    db.select({ tmdbId: watchlist.tmdbId, mediaType: watchlist.mediaType, title: watchlist.title, posterPath: watchlist.posterPath }).from(watchlist).where(and(eq(watchlist.userId, targetId), inArray(watchlist.tmdbId, ids))),
    db.select({ tmdbId: userRatings.tmdbId, mediaType: userRatings.mediaType, title: userRatings.title, posterPath: userRatings.posterPath }).from(userRatings).where(and(eq(userRatings.userId, targetId), inArray(userRatings.tmdbId, ids))),
    db.select({ tmdbId: watchHistory.tmdbId, mediaType: watchHistory.mediaType, title: watchHistory.title, posterPath: watchHistory.posterPath }).from(watchHistory).where(and(eq(watchHistory.userId, targetId), inArray(watchHistory.tmdbId, ids))),
  ];
  const results = await Promise.all(sources);
  const map = new Map();
  for (const rows of results) {
    for (const r of rows) {
      const key = titleKey(r.mediaType, r.tmdbId);
      const existing = map.get(key);
      // Prioriza la primera fuente con póster; completa título si falta.
      if (!existing) map.set(key, { title: r.title || null, posterPath: r.posterPath || null });
      else {
        if (!existing.posterPath && r.posterPath) existing.posterPath = r.posterPath;
        if (!existing.title && r.title) existing.title = r.title;
      }
    }
  }
  return map;
}

// Rellena `posterPath` y `title` cuando falten en los items de un perfil.
// Los visionados (watch_history) suelen guardarse sin poster_path, así que:
//   1) se busca el póster en otras tablas del usuario (favoritos, watchlist,
//      puntuaciones…) — sin coste de red;
//   2) lo que siga sin póster se resuelve en TMDb: para 'tv' el póster de la SERIE
//      (episodios agrupados por serie), para 'movie' el de la película.
// Muta y devuelve los mismos items. No-op si todos ya tienen ambos datos.
async function fillMissingPosters(db, targetId, items) {
  const missing = items.filter((i) => !i.posterPath || !i.title);
  if (!missing.length) return items;

  // 1) Referencia cruzada con el resto de tablas del usuario.
  const meta = await resolveTitleMetadata(db, targetId, missing);
  for (const it of missing) {
    const m = meta.get(titleKey(it.mediaType, it.tmdbId));
    if (m) {
      if (!it.posterPath && m.posterPath) it.posterPath = m.posterPath;
      if (!it.title && m.title) it.title = m.title;
    }
  }

  // 2) Lo que aún falte → metadatos de TMDb. Además del póster permite que una
  // reseña o actividad recién creada muestre el título aunque no estuviera aún
  // en otra tabla del usuario.
  const unresolved = missing.filter((i) => !i.posterPath || !i.title);
  if (unresolved.length) {
    const metadata = await getMediaMetadataMap(unresolved).catch(() => new Map());
    for (const item of unresolved) {
      const meta = metadataFor(metadata, item.mediaType, item.tmdbId);
      if (!meta) continue;
      if (!item.posterPath) item.posterPath = meta.poster_path || null;
      if (!item.title) {
        item.title = item.mediaType === 'movie'
          ? meta.title || meta.original_title || null
          : meta.name || meta.original_name || null;
      }
    }
  }

  // 3) Fallback ligero para los pósters que sigan sin resolverse.
  const stillMissing = missing.filter((i) => !i.posterPath);
  if (stillMissing.length) {
    const posters = await Promise.all(
      stillMissing.map((i) => getTitlePoster({ tmdbId: i.tmdbId, mediaType: i.mediaType })),
    );
    stillMissing.forEach((it, idx) => {
      if (posters[idx]) it.posterPath = posters[idx];
    });
  }
  return items;
}

// Reseñas nativas del usuario (+ su nota del título + título/póster best-effort).
export async function getUserReviews(db, targetId, opts = {}) {
  const { limit, offset } = pageParams(opts);
  // Inyectable únicamente para pruebas; en producción completa los datos desde
  // las tablas del usuario y, si no existen ahí, desde TMDb.
  const hydrateMissing = typeof opts.hydrateMissing === 'function'
    ? opts.hydrateMissing
    : fillMissingPosters;
  const rows = await db
    .select({
      id: titleComments.id,
      tmdbId: titleComments.tmdbId,
      mediaType: titleComments.mediaType,
      body: titleComments.body,
      spoiler: titleComments.spoiler,
      likes: titleComments.likes,
      createdAt: titleComments.createdAt,
    })
    .from(titleComments)
    .where(and(eq(titleComments.userId, targetId), eq(titleComments.source, 'native')))
    .orderBy(desc(titleComments.createdAt))
    .limit(limit + 1)
    .offset(offset);

  const page = packPage(rows, limit, offset);
  if (!page.items.length) return page;

  const [meta, ratingRows] = await Promise.all([
    resolveTitleMetadata(db, targetId, page.items),
    db
      .select({ tmdbId: userRatings.tmdbId, mediaType: userRatings.mediaType, rating: userRatings.rating })
      .from(userRatings)
      .where(and(eq(userRatings.userId, targetId), inArray(userRatings.tmdbId, page.items.map((r) => Number(r.tmdbId))), inArray(userRatings.mediaType, ['movie', 'tv']))),
  ]);
  const ratingByKey = new Map(ratingRows.map((r) => [titleKey(r.mediaType, r.tmdbId), Number(r.rating)]));

  page.items = page.items.map((r) => {
    const key = titleKey(r.mediaType, r.tmdbId);
    const m = meta.get(key) || {};
    return {
      id: r.id,
      tmdbId: r.tmdbId,
      mediaType: r.mediaType,
      title: m.title || null,
      posterPath: m.posterPath || null,
      body: r.body,
      spoiler: r.spoiler,
      likes: r.likes,
      createdAt: r.createdAt,
      rating: ratingByKey.get(key) ?? null,
    };
  });
  // Una reseña puede existir sin que el usuario haya añadido el título a otra
  // lista. En ese caso resolveTitleMetadata no tiene de dónde sacar el título
  // ni el póster, así que completamos ambos antes de responder al perfil.
  await hydrateMissing(db, targetId, page.items);
  return page;
}

// Genérico para watchlist/favorites (misma forma: título + póster + addedAt).
// Las entradas antiguas pueden no conservar el artwork cacheado; se completa
// antes de responder para que las vistas de Perfil no reemplacen portadas por
// tarjetas de texto al refrescar su previa lateral.
async function getSimpleTitleList(db, table, targetId, opts) {
  const { limit, offset } = pageParams(opts);
  const rows = await db
    .select({
      tmdbId: table.tmdbId,
      mediaType: table.mediaType,
      title: table.title,
      posterPath: table.posterPath,
      addedAt: table.addedAt,
    })
    .from(table)
    .where(eq(table.userId, targetId))
    .orderBy(desc(table.addedAt))
    .limit(limit + 1)
    .offset(offset);
  const page = packPage(rows, limit, offset);
  await fillMissingPosters(db, targetId, page.items);
  return page;
}

export async function getUserWatchlist(db, targetId, opts = {}) {
  const page = await getSimpleTitleList(db, watchlist, targetId, opts);
  const englishPosters = await resolveEnglishPosterPaths(db, page.items);
  page.items = applyResolvedEnglishPosterPaths(
    page.items,
    englishPosters,
    { strict: true },
  );
  return page;
}

export async function getUserFavorites(db, targetId, opts = {}) {
  return getSimpleTitleList(db, favorites, targetId, opts);
}

// Puntuaciones a nivel título, más recientes primero.
export async function getUserRatings(db, targetId, opts = {}) {
  const { limit, offset } = pageParams(opts);
  const rows = await db
    .select({
      id: userRatings.id,
      tmdbId: userRatings.tmdbId,
      mediaType: userRatings.mediaType,
      title: userRatings.title,
      posterPath: userRatings.posterPath,
      rating: userRatings.rating,
      ratedAt: userRatings.ratedAt,
    })
    .from(userRatings)
    .where(
      and(
        eq(userRatings.userId, targetId),
        inArray(userRatings.mediaType, ['movie', 'tv']),
        isNull(userRatings.season),
        isNull(userRatings.episode),
      ),
    )
    .orderBy(desc(userRatings.ratedAt))
    .limit(limit + 1)
    .offset(offset);
  const page = packPage(rows, limit, offset);
  page.items = page.items.map((r) => ({ ...r, rating: Number(r.rating) }));
  return page;
}

// Diario: registros reales de historial, no títulos deduplicados. Así una serie
// conserva cada episodio que se ha visto; el cliente puede colapsar episodios
// consecutivos igual que Historial sin perder el detalle al desplegarlos.
export async function getUserWatched(db, targetId, opts = {}) {
  const { limit, offset } = pageParams(opts);
  const rows = await db
    .select({
      id: watchHistory.id,
      tmdbId: watchHistory.tmdbId,
      mediaType: watchHistory.mediaType,
      season: watchHistory.season,
      episode: watchHistory.episode,
      title: watchHistory.title,
      posterPath: watchHistory.posterPath,
      activityGroup: watchHistory.activityGroup,
      watchedAt: watchHistory.watchedAt,
    })
    .from(watchHistory)
    .where(eq(watchHistory.userId, targetId))
    // Las series completadas insertan varios episodios con la misma fecha.
    // El ID deja el orden totalmente determinado entre páginas y evita que
    // `offset` devuelva otra combinación de tarjetas en cada carga.
    .orderBy(desc(watchHistory.watchedAt), desc(watchHistory.createdAt), desc(watchHistory.id))
    .limit(limit + 1)
    .offset(offset);

  const page = packPage(rows, limit, offset);
  if (!page.items.length) return page;

  const ratingRows = await db
    .select({ tmdbId: userRatings.tmdbId, mediaType: userRatings.mediaType, rating: userRatings.rating })
    .from(userRatings)
    .where(and(eq(userRatings.userId, targetId), inArray(userRatings.tmdbId, page.items.map((r) => Number(r.tmdbId))), inArray(userRatings.mediaType, ['movie', 'tv'])));
  const ratingByKey = new Map(ratingRows.map((r) => [titleKey(r.mediaType, r.tmdbId), Number(r.rating)]));

  page.items = page.items.map((r) => ({
    id: r.id,
    tmdbId: r.tmdbId,
    mediaType: r.mediaType,
    season: r.season,
    episode: r.episode,
    title: r.title,
    posterPath: r.posterPath,
    activityGroup: r.activityGroup,
    watchedAt: r.watchedAt,
    rating: ratingByKey.get(titleKey(r.mediaType, r.tmdbId)) ?? null,
  }));
  // watch_history se guarda a menudo sin póster: se resuelve aquí (serie/película).
  await fillMissingPosters(db, targetId, page.items);
  // Diario recibe la misma selección de portada inglesa de DetailsClient antes
  // de responder. Así la UI no necesita renderizar artwork español, placeholders
  // ni una segunda pasada visual para sustituir cada tarjeta.
  const englishPosters = await resolveEnglishPosterPaths(db, page.items);
  page.items = page.items.map((item) => ({
    ...item,
    posterPath: englishPosters.get(titleKey(item.mediaType, item.tmdbId)) || item.posterPath,
  }));
  return page;
}

// Listas PÚBLICAS del usuario, con conteo y pósters de preview.
export async function getUserLists(db, targetId, opts = {}) {
  const { limit, offset, includePrivateLists = false } = opts;
  const page = pageParams({ limit, offset });
  const listVisibility = includePrivateLists
    ? eq(userLists.userId, targetId)
    : and(eq(userLists.userId, targetId), eq(userLists.isPublic, true));
  const rows = await db
    .select({
      id: userLists.id,
      name: userLists.name,
      description: userLists.description,
      isPublic: userLists.isPublic,
      updatedAt: userLists.updatedAt,
    })
    .from(userLists)
    .where(listVisibility)
    .orderBy(desc(userLists.updatedAt))
    .limit(page.limit + 1)
    .offset(page.offset);

  const result = packPage(rows, page.limit, page.offset);
  if (!result.items.length) return result;

  const listIds = result.items.map((l) => l.id);
  // Conteo exacto (grouped count) + pósters de preview, en paralelo. Se evita el
  // subquery correlacionado (frágil al interpolar la columna con Drizzle).
  const [countRows, previewRows] = await Promise.all([
    db
      .select({ listId: userListItems.listId, n: count() })
      .from(userListItems)
      .where(inArray(userListItems.listId, listIds))
      .groupBy(userListItems.listId),
    db
      .select({
        listId: userListItems.listId,
        posterPath: userListItems.posterPath,
        position: userListItems.position,
        addedAt: userListItems.addedAt,
      })
      .from(userListItems)
      .where(inArray(userListItems.listId, listIds))
      .orderBy(asc(userListItems.position), desc(userListItems.addedAt)),
  ]);

  const countByList = new Map(countRows.map((r) => [r.listId, r.n]));
  const previewByList = new Map();
  for (const p of previewRows) {
    if (!p.posterPath) continue;
    const arr = previewByList.get(p.listId) || [];
    if (arr.length < LIST_PREVIEW_LIMIT) arr.push(p.posterPath);
    previewByList.set(p.listId, arr);
  }

  result.items = result.items.map((l) => ({
    id: l.id,
    name: l.name,
    description: l.description || null,
    isPublic: Boolean(l.isPublic),
    itemCount: countByList.get(l.id) || 0,
    updatedAt: l.updatedAt,
    previewPosters: previewByList.get(l.id) || [],
  }));
  return result;
}

// Actividad pública del perfil. Se deriva de los registros ya persistidos en vez
// de duplicarlos en otra tabla: así incluye también la actividad anterior a esta
// vista y siempre refleja el estado real de cada sección.
export async function getUserActivity(db, targetId, opts = {}) {
  const { limit, offset } = pageParams(opts);
  // Cada fuente se consulta hasta el punto que necesita la página. El tope evita
  // que una URL manipulada convierta el feed en una consulta desproporcionada.
  const sourceLimit = Math.min(1000, Math.max(limit + offset + 1, limit + 1));

  const [reviewRows, watchedRows, watchlistRows, favoriteRows, ratingRows, listRows, listItemRows] = await Promise.all([
    db
      .select({
        id: titleComments.id,
        tmdbId: titleComments.tmdbId,
        mediaType: titleComments.mediaType,
        body: titleComments.body,
        spoiler: titleComments.spoiler,
        createdAt: titleComments.createdAt,
      })
      .from(titleComments)
      .where(and(eq(titleComments.userId, targetId), eq(titleComments.source, 'native')))
      .orderBy(desc(titleComments.createdAt))
      .limit(sourceLimit),
    db
      .select({
        id: watchHistory.id,
        tmdbId: watchHistory.tmdbId,
        mediaType: watchHistory.mediaType,
        season: watchHistory.season,
        episode: watchHistory.episode,
        title: watchHistory.title,
        posterPath: watchHistory.posterPath,
        activityGroup: watchHistory.activityGroup,
        createdAt: watchHistory.watchedAt,
      })
      .from(watchHistory)
      .where(eq(watchHistory.userId, targetId))
      .orderBy(desc(watchHistory.watchedAt))
      .limit(sourceLimit),
    db
      .select({
        id: watchlist.id,
        tmdbId: watchlist.tmdbId,
        mediaType: watchlist.mediaType,
        title: watchlist.title,
        posterPath: watchlist.posterPath,
        createdAt: watchlist.addedAt,
      })
      .from(watchlist)
      .where(eq(watchlist.userId, targetId))
      .orderBy(desc(watchlist.addedAt))
      .limit(sourceLimit),
    db
      .select({
        id: favorites.id,
        tmdbId: favorites.tmdbId,
        mediaType: favorites.mediaType,
        title: favorites.title,
        posterPath: favorites.posterPath,
        createdAt: favorites.addedAt,
      })
      .from(favorites)
      .where(eq(favorites.userId, targetId))
      .orderBy(desc(favorites.addedAt))
      .limit(sourceLimit),
    db
      .select({
        id: userRatings.id,
        tmdbId: userRatings.tmdbId,
        mediaType: userRatings.mediaType,
        season: userRatings.season,
        episode: userRatings.episode,
        title: userRatings.title,
        posterPath: userRatings.posterPath,
        rating: userRatings.rating,
        createdAt: userRatings.ratedAt,
      })
      .from(userRatings)
      .where(eq(userRatings.userId, targetId))
      .orderBy(desc(userRatings.ratedAt))
      .limit(sourceLimit),
    db
      .select({ id: userLists.id, name: userLists.name, createdAt: userLists.createdAt })
      .from(userLists)
      .where(and(eq(userLists.userId, targetId), eq(userLists.isPublic, true)))
      .orderBy(desc(userLists.createdAt))
      .limit(sourceLimit),
    db
      .select({
        id: userListItems.id,
        tmdbId: userListItems.tmdbId,
        mediaType: userListItems.mediaType,
        title: userListItems.title,
        posterPath: userListItems.posterPath,
        listId: userLists.id,
        listName: userLists.name,
        createdAt: userListItems.addedAt,
      })
      .from(userListItems)
      .innerJoin(userLists, eq(userLists.id, userListItems.listId))
      .where(and(eq(userLists.userId, targetId), eq(userLists.isPublic, true)))
      .orderBy(desc(userListItems.addedAt))
      .limit(sourceLimit),
  ]);

  const events = [
    ...reviewRows.map((row) => ({ ...row, id: `review:${row.id}`, type: 'review' })),
    ...collapseGroupedWatchActivity(watchedRows).map((row) => ({
      ...row,
      id: row.activityGroup ? `watched-group:${row.activityGroup}` : `watched:${row.id}`,
      type: 'watched',
    })),
    ...watchlistRows.map((row) => ({ ...row, id: `watchlist:${row.id}`, type: 'watchlist' })),
    ...favoriteRows.map((row) => ({ ...row, id: `favorite:${row.id}`, type: 'favorite' })),
    ...ratingRows.map((row) => ({
      ...row,
      id: `rating:${row.id}`,
      type: 'rating',
      // Las puntuaciones de episodios conservan la referencia al episodio, pero
      // se enlazan y se hidratan como su serie padre.
      mediaType: row.mediaType === 'episode' ? 'tv' : row.mediaType,
    })),
    ...listRows.map((row) => ({ ...row, id: `list:${row.id}`, type: 'list' })),
    ...listItemRows.map((row) => ({ ...row, id: `list-item:${row.id}`, type: 'list_item' })),
  ];

  events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const page = packPage(events.slice(offset, offset + limit + 1), limit, offset);

  const titleEvents = page.items.filter((item) => item.tmdbId && item.mediaType);
  const reviewItems = page.items.filter((item) => item.type === 'review');
  const reviewRatingRows = reviewItems.length
    ? await db
        .select({ tmdbId: userRatings.tmdbId, mediaType: userRatings.mediaType, rating: userRatings.rating })
        .from(userRatings)
        .where(and(
          eq(userRatings.userId, targetId),
          inArray(userRatings.tmdbId, reviewItems.map((item) => Number(item.tmdbId))),
          inArray(userRatings.mediaType, ['movie', 'tv']),
        ))
    : [];
  const reviewRatingByKey = new Map(
    reviewRatingRows.map((row) => [titleKey(row.mediaType, row.tmdbId), Number(row.rating)]),
  );
  for (const item of reviewItems) {
    item.rating = reviewRatingByKey.get(titleKey(item.mediaType, item.tmdbId)) ?? null;
  }
  await fillMissingPosters(db, targetId, titleEvents);
  return page;
}

// Busca usuarios por username/displayName para el descubrimiento de miembros.
export async function searchUsers(db, { query, viewerId, limit = 20 }) {
  const q = String(query || '').trim();
  if (q.length < 1) return [];
  const like = `%${q}%`;

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
    })
    .from(users)
    .where(
      and(
        eq(users.isActive, true),
        or(ilike(users.username, like), ilike(users.displayName, like)),
        viewerId ? ne(users.id, viewerId) : undefined,
      ),
    )
    .orderBy(users.username)
    .limit(Math.min(50, Math.max(1, Number(limit) || 20)));

  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const [followerCounts, viewerFollowing] = await Promise.all([
    db
      .select({ followingId: follows.followingId, n: count() })
      .from(follows)
      .where(inArray(follows.followingId, ids))
      .groupBy(follows.followingId),
    viewerId
      ? db
          .select({ followingId: follows.followingId })
          .from(follows)
          .where(and(eq(follows.followerId, viewerId), inArray(follows.followingId, ids)))
      : Promise.resolve([]),
  ]);

  const countByuser = new Map(followerCounts.map((r) => [r.followingId, r.n]));
  const followingSet = new Set(viewerFollowing.map((r) => r.followingId));

  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    displayName: r.displayName || r.username,
    avatarUrl: r.avatarUrl || null,
    bio: r.bio || null,
    followerCount: countByuser.get(r.id) || 0,
    isFollowing: followingSet.has(r.id),
  }));
}
