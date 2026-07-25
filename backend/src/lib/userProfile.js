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

const RECENT_WATCHED_SCAN = 40; // filas a escanear para deduplicar por título
const RECENT_WATCHED_LIMIT = 5;
const WATCHLIST_PREVIEW_LIMIT = 5;
const FOLLOWING_PREVIEW_LIMIT = 12;
export const PROFILE_FAVORITES_MAX = 5;
const LIST_PREVIEW_LIMIT = 5;
const PROFILE_ANALYTICS_HISTORY_LIMIT = 1500;
const DEFAULT_MOVIE_RUNTIME_MINS = 100;
const DEFAULT_EPISODE_RUNTIME_MINS = 45;

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

// Valida y normaliza la selección curada de favoritos del perfil: descarta
// entradas mal formadas, deduplica por título, recorta a `max` y reasigna
// `position` 0..n según el orden recibido.
export function normalizeProfileFavorites(items, max = PROFILE_FAVORITES_MAX) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(items) ? items : []) {
    const tmdbId = Number(raw?.tmdbId);
    const mediaType = raw?.mediaType;
    if (!Number.isInteger(tmdbId) || tmdbId <= 0) continue;
    if (mediaType !== 'movie' && mediaType !== 'tv') continue;
    const key = titleKey(mediaType, tmdbId);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      tmdbId,
      mediaType,
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

function mediaCacheKeys(mediaType, tmdbId) {
  const media = mediaType === 'movie' ? 'movie' : 'tv';
  return [`tmdb:${media}:${tmdbId}`, `${media}:${tmdbId}`];
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
    db.select({ n: count() }).from(follows).where(eq(follows.followingId, targetId)),
    db.select({ n: count() }).from(follows).where(eq(follows.followerId, targetId)),
    db.select({ n: count() }).from(userRatings).where(eq(userRatings.userId, targetId)),
    // Favoritos curados (≤5, por posición).
    db
      .select()
      .from(profileFavorites)
      .where(eq(profileFavorites.userId, targetId))
      .orderBy(profileFavorites.position)
      .limit(PROFILE_FAVORITES_MAX),
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
    buildSectionCounts(db, targetId),
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
    favorites: favoriteRows.map((f) => ({
      tmdbId: f.tmdbId,
      mediaType: f.mediaType,
      title: f.title,
      posterPath: f.posterPath,
    })),
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
export async function buildSectionCounts(db, targetId) {
  const distinctWatched = sql`COUNT(DISTINCT (${watchHistory.mediaType} || ':' || ${watchHistory.tmdbId}))`.mapWith(Number);
  const [reviews, watched, watchlistC, favoritesC, ratingsC, listsC] = await Promise.all([
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
      .where(and(eq(userLists.userId, targetId), eq(userLists.isPublic, true))),
  ]);
  return {
    reviews: reviews[0]?.n || 0,
    watched: watched[0]?.n || 0,
    watchlist: watchlistC[0]?.n || 0,
    favorites: favoritesC[0]?.n || 0,
    ratings: ratingsC[0]?.n || 0,
    lists: listsC[0]?.n || 0,
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

// Rellena `posterPath` (y `title` si falta) en los items que vengan sin póster.
// Los visionados (watch_history) suelen guardarse sin poster_path, así que:
//   1) se busca el póster en otras tablas del usuario (favoritos, watchlist,
//      puntuaciones…) — sin coste de red;
//   2) lo que siga sin póster se resuelve en TMDb: para 'tv' el póster de la SERIE
//      (episodios agrupados por serie), para 'movie' el de la película.
// Muta y devuelve los mismos items. No-op si todos ya tienen póster.
async function fillMissingPosters(db, targetId, items) {
  const missing = items.filter((i) => !i.posterPath);
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

  // 2) Lo que aún falte → TMDb (cacheado en memoria por título).
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
  return page;
}

// Genérico para watchlist/favorites (misma forma: título + póster + addedAt).
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
  return packPage(rows, limit, offset);
}

export function getUserWatchlist(db, targetId, opts = {}) {
  return getSimpleTitleList(db, watchlist, targetId, opts);
}

export function getUserFavorites(db, targetId, opts = {}) {
  return getSimpleTitleList(db, favorites, targetId, opts);
}

// Puntuaciones a nivel título, más recientes primero.
export async function getUserRatings(db, targetId, opts = {}) {
  const { limit, offset } = pageParams(opts);
  const rows = await db
    .select({
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

// Visionados: títulos DISTINTOS, el más reciente primero, con la nota del usuario.
export async function getUserWatched(db, targetId, opts = {}) {
  const { limit, offset } = pageParams(opts);
  const rows = await db
    .select({
      tmdbId: watchHistory.tmdbId,
      mediaType: watchHistory.mediaType,
      title: sql`(array_agg(${watchHistory.title} ORDER BY ${watchHistory.watchedAt} DESC))[1]`,
      posterPath: sql`(array_agg(${watchHistory.posterPath} ORDER BY ${watchHistory.watchedAt} DESC))[1]`,
      watchedAt: sql`MAX(${watchHistory.watchedAt})`,
    })
    .from(watchHistory)
    .where(eq(watchHistory.userId, targetId))
    .groupBy(watchHistory.tmdbId, watchHistory.mediaType)
    .orderBy(sql`MAX(${watchHistory.watchedAt}) DESC`)
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
    tmdbId: r.tmdbId,
    mediaType: r.mediaType,
    title: r.title,
    posterPath: r.posterPath,
    watchedAt: r.watchedAt,
    rating: ratingByKey.get(titleKey(r.mediaType, r.tmdbId)) ?? null,
  }));
  // watch_history se guarda a menudo sin póster: se resuelve aquí (serie/película).
  await fillMissingPosters(db, targetId, page.items);
  return page;
}

// Listas PÚBLICAS del usuario, con conteo y pósters de preview.
export async function getUserLists(db, targetId, opts = {}) {
  const { limit, offset } = pageParams(opts);
  const rows = await db
    .select({
      id: userLists.id,
      name: userLists.name,
      description: userLists.description,
      updatedAt: userLists.updatedAt,
    })
    .from(userLists)
    .where(and(eq(userLists.userId, targetId), eq(userLists.isPublic, true)))
    .orderBy(desc(userLists.updatedAt))
    .limit(limit + 1)
    .offset(offset);

  const page = packPage(rows, limit, offset);
  if (!page.items.length) return page;

  const listIds = page.items.map((l) => l.id);
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

  page.items = page.items.map((l) => ({
    id: l.id,
    name: l.name,
    description: l.description || null,
    itemCount: countByList.get(l.id) || 0,
    updatedAt: l.updatedAt,
    previewPosters: previewByList.get(l.id) || [],
  }));
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
