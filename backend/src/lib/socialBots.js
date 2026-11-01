// src/lib/socialBots.js
// Usuarios automáticos que dan vida a Social: ven estrenos de cine y episodios
// recién emitidos, los puntúan, a veces los reseñan o los marcan como
// favoritos, y apuntan próximos estrenos en pendientes (ver socialBotsCore).
//
// Ligero a propósito:
//   - Los títulos salen de los pools del dashboard que ya están cacheados en
//     memoria/BD (new_releases, trending, trending_section, popular, region_top,
//     anticipated, calendar_episodes_v3): ninguna llamada extra a TMDb. Van
//     primero los títulos en tendencias y populares (socialBotsCore.rankByFame).
//   - El tic (server.js) solo calcula en memoria; toca la BD únicamente cuando
//     a alguna cuenta le toca actuar según su plan del día (~20 veces al día).
//   - Escriben directamente en las tablas, sin pasar por las rutas: no disparan
//     notificaciones push ni avisos a nadie.
//   - Un candado de Postgres (pg_try_advisory_xact_lock) evita que dos
//     procesos (p. ej. un dev apuntando a la BD de producción) actúen a la vez,
//     y el recuento de lo hecho hoy se lee de la BD dentro del candado: un
//     reinicio no duplica acciones.

import { and, eq, gte, inArray, sql } from 'drizzle-orm';

import { getPool } from '../dashboard/pools.js';
import { db } from '../db/client.js';
import {
  favorites,
  follows,
  titleComments,
  userRatings,
  users,
  watchHistory,
  watchlist,
} from '../db/schema.js';
import { invalidateLevelState } from '../level/store.js';
import {
  BOT_FOLLOWS,
  BOT_TZ,
  BOTS,
  botDayKey,
  botEmail,
  botRating,
  botReview,
  buildCandidates,
  chance,
  chooseSession,
  dueCount,
  episodeKey,
  jitteredAgo,
  marathonEpisodes,
  planBotDay,
  seededRandom,
  titleKey,
} from './socialBotsCore.js';
import { zonedMidnight } from './todayActivityCore.js';
import { BOT_AVATARS } from './socialBotsAvatars.js';

// Clave del candado de Postgres (cualquier entero fijo y propio).
const LOCK_KEY = 74_1105_2026;
// Como mucho una sesión por cuenta y tic: si el servidor estuvo parado, se
// ponen al día poco a poco en vez de soltar todo de golpe.
const MAX_SESSIONS_PER_BOT_PER_TICK = 1;
// Cuánto historial propio se mira para no repetir títulos.
const DONE_LOOKBACK_DAYS = 400;

let accountsCache = null; // [{ ...bot, id, username, displayName, avatarUrl }]
let lastKnownDone = { dayKey: null, due: -1 };

// ─── Cuentas ──────────────────────────────────────────────────────────────────

/** Crea las cuentas que falten (sin contraseña) y sus seguimientos mutuos. */
export async function ensureBotAccounts() {
  const emails = BOTS.map((bot) => botEmail(bot.handle));
  const existing = await db
    .select({ id: users.id, email: users.email, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl })
    .from(users)
    .where(inArray(users.email, emails));
  const byEmail = new Map(existing.map((row) => [row.email, row]));

  let created = 0;
  for (const bot of BOTS) {
    const email = botEmail(bot.handle);
    if (byEmail.has(email)) continue;
    // Si alguien ya usa ese nombre de usuario, se le añade un sufijo.
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.username, bot.handle)).limit(1);
    const username = taken ? `${bot.handle}${Math.floor(10 + Math.random() * 90)}` : bot.handle;
    const [row] = await db
      .insert(users)
      .values({
        email,
        username,
        passwordHash: null,
        displayName: bot.displayName,
        bio: bot.bio,
        avatarUrl: BOT_AVATARS[bot.handle] || null,
        emailVerified: true,
      })
      .onConflictDoNothing()
      .returning({ id: users.id, email: users.email, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl });
    if (row) {
      byEmail.set(email, row);
      created += 1;
    }
  }

  const accounts = BOTS
    .map((bot) => ({ ...bot, ...byEmail.get(botEmail(bot.handle)) }))
    .filter((account) => account.id);

  if (created > 0) {
    const ids = Object.fromEntries(accounts.map((account) => [account.handle, account.id]));
    const pairs = BOT_FOLLOWS
      .filter(([a, b]) => ids[a] && ids[b])
      .map(([a, b]) => ({ followerId: ids[a], followingId: ids[b] }));
    if (pairs.length) await db.insert(follows).values(pairs).onConflictDoNothing();
  }

  accountsCache = accounts;
  return { accounts, created };
}

/** Borra las cuentas y, en cascada, toda su actividad. */
export async function removeBotAccounts() {
  const removed = await db
    .delete(users)
    .where(inArray(users.email, BOTS.map((bot) => botEmail(bot.handle))))
    .returning({ username: users.username });
  accountsCache = null;
  lastKnownDone = { dayKey: null, due: -1 };
  return removed.map((row) => row.username);
}

// ─── Lo hecho hoy y lo que ya tienen ──────────────────────────────────────────

/**
 * Sesiones hechas hoy por cuenta: títulos distintos vistos + títulos
 * apuntados en pendientes desde la medianoche local.
 */
async function sessionsToday(handle, accounts, midnight) {
  const ids = accounts.map((account) => account.id);
  const since = new Date(midnight);
  const [watched, pending] = await Promise.all([
    handle
      .selectDistinct({ userId: watchHistory.userId, tmdbId: watchHistory.tmdbId, mediaType: watchHistory.mediaType })
      .from(watchHistory)
      .where(and(inArray(watchHistory.userId, ids), gte(watchHistory.watchedAt, since))),
    handle
      .selectDistinct({ userId: watchlist.userId, tmdbId: watchlist.tmdbId, mediaType: watchlist.mediaType })
      .from(watchlist)
      .where(and(inArray(watchlist.userId, ids), gte(watchlist.addedAt, since))),
  ]);
  const counts = new Map();
  for (const row of [...watched, ...pending]) counts.set(row.userId, (counts.get(row.userId) || 0) + 1);
  return counts;
}

async function loadDone(handle, userId, nowMs) {
  const since = new Date(nowMs - DONE_LOOKBACK_DAYS * 86_400_000);
  const [history, pending] = await Promise.all([
    handle
      .select({ tmdbId: watchHistory.tmdbId, mediaType: watchHistory.mediaType, season: watchHistory.season, episode: watchHistory.episode })
      .from(watchHistory)
      .where(and(eq(watchHistory.userId, userId), gte(watchHistory.watchedAt, since))),
    handle
      .select({ tmdbId: watchlist.tmdbId, mediaType: watchlist.mediaType })
      .from(watchlist)
      .where(eq(watchlist.userId, userId)),
  ]);
  const done = { titles: new Set(), episodes: new Set(), watchlist: new Set() };
  for (const row of history) {
    done.titles.add(titleKey(row.mediaType, row.tmdbId));
    if (row.season != null && row.episode != null) done.episodes.add(episodeKey(row.tmdbId, row.season, row.episode));
  }
  for (const row of pending) done.watchlist.add(titleKey(row.mediaType, row.tmdbId));
  return done;
}

// ─── Una sesión ───────────────────────────────────────────────────────────────

async function rate(handle, account, values, at) {
  await handle.insert(userRatings).values({ userId: account.id, ...values, ratedAt: at, updatedAt: at }).onConflictDoNothing();
}

async function review(handle, account, { tmdbId, mediaType }, body, at) {
  const [already] = await handle
    .select({ id: titleComments.id })
    .from(titleComments)
    .where(and(eq(titleComments.userId, account.id), eq(titleComments.tmdbId, tmdbId), eq(titleComments.mediaType, mediaType)))
    .limit(1);
  if (already) return false;
  await handle.insert(titleComments).values({
    tmdbId,
    mediaType,
    source: 'native',
    userId: account.id,
    authorName: account.displayName || account.username,
    authorUsername: account.username,
    authorAvatarUrl: account.avatarUrl || null,
    authorIsVip: false,
    body,
    likes: 0,
    spoiler: false,
    createdAt: at,
    importedAt: at,
  });
  return true;
}

async function favorite(handle, account, { tmdbId, mediaType, title, posterPath }, at) {
  await handle.insert(favorites).values({ userId: account.id, tmdbId, mediaType, title, posterPath, addedAt: at }).onConflictDoNothing();
}

/** Ejecuta la sesión elegida. Devuelve un resumen para el log o null. */
async function runSession(handle, account, session, rng, nowMs) {
  const { kind, title } = session;

  if (kind === 'watchlist') {
    await handle.insert(watchlist).values({
      userId: account.id,
      tmdbId: title.tmdbId,
      mediaType: title.mediaType,
      title: title.title,
      posterPath: title.posterPath,
      addedAt: jitteredAgo(rng, nowMs, 0.5, 6),
    }).onConflictDoNothing();
    return `pendientes: ${title.title}`;
  }

  if (kind === 'movie') {
    const watchedAt = jitteredAgo(rng, nowMs, 2, 9);
    await handle.insert(watchHistory).values({
      userId: account.id, tmdbId: title.tmdbId, mediaType: 'movie', title: title.title, posterPath: title.posterPath, watchedAt,
    });
    await handle.delete(watchlist).where(and(eq(watchlist.userId, account.id), eq(watchlist.tmdbId, title.tmdbId), eq(watchlist.mediaType, 'movie')));
    const parts = [`vio ${title.title}`];
    if (chance(rng, account.rateChance)) {
      const rating = botRating(rng, title.voteAverage, account);
      await rate(handle, account, { tmdbId: title.tmdbId, mediaType: 'movie', rating, title: title.title, posterPath: title.posterPath }, jitteredAgo(rng, nowMs, 0.6, 1.8));
      parts.push(`nota ${rating}`);
      if (chance(rng, account.reviewChance)
        && await review(handle, account, { tmdbId: title.tmdbId, mediaType: 'movie' }, botReview(rng, rating), jitteredAgo(rng, nowMs, 0.05, 0.5))) {
        parts.push('reseña');
      }
      if (rating >= 9 && chance(rng, account.favoriteChance)) {
        await favorite(handle, account, { tmdbId: title.tmdbId, mediaType: 'movie', title: title.title, posterPath: title.posterPath }, jitteredAgo(rng, nowMs, 0.02, 0.3));
        parts.push('favorito');
      }
    }
    return parts.join(', ');
  }

  // Episodio nuevo (con maratón opcional) o estreno de serie (1x01).
  const ep = kind === 'premiere'
    ? { tmdbId: title.tmdbId, title: title.title, posterPath: title.posterPath, season: 1, episode: 1 }
    : title;
  const previous = marathonEpisodes(rng, ep, session.done);
  const rows = previous.map((number, index) => ({
    userId: account.id, tmdbId: ep.tmdbId, mediaType: 'tv', season: ep.season, episode: number,
    title: ep.title, posterPath: ep.posterPath,
    watchedAt: jitteredAgo(rng, nowMs, (previous.length - index) * 52 + 4, (previous.length - index) * 58 + 6),
  }));
  rows.push({
    userId: account.id, tmdbId: ep.tmdbId, mediaType: 'tv', season: ep.season, episode: ep.episode,
    title: ep.title, posterPath: ep.posterPath, watchedAt: jitteredAgo(rng, nowMs, 2, 6),
  });
  await handle.insert(watchHistory).values(rows);
  await handle.delete(watchlist).where(and(eq(watchlist.userId, account.id), eq(watchlist.tmdbId, ep.tmdbId), eq(watchlist.mediaType, 'tv')));

  const parts = [`vio ${ep.title} ${ep.season}x${String(ep.episode).padStart(2, '0')}${previous.length ? ` (+${previous.length} antes)` : ''}`];
  if (chance(rng, account.rateChance * 0.6)) {
    const rating = botRating(rng, title.voteAverage, account);
    await rate(handle, account, {
      tmdbId: ep.tmdbId, mediaType: 'episode', season: ep.season, episode: ep.episode, rating, title: ep.title, posterPath: ep.posterPath,
    }, jitteredAgo(rng, nowMs, 0.6, 1.8));
    parts.push(`nota ${rating}`);
    if (kind === 'premiere' && chance(rng, account.reviewChance * 0.5)
      && await review(handle, account, { tmdbId: ep.tmdbId, mediaType: 'tv' }, botReview(rng, rating), jitteredAgo(rng, nowMs, 0.05, 0.5))) {
      parts.push('reseña');
    }
    if (rating >= 9 && chance(rng, account.favoriteChance * 0.5)) {
      await favorite(handle, account, { tmdbId: ep.tmdbId, mediaType: 'tv', title: ep.title, posterPath: ep.posterPath }, jitteredAgo(rng, nowMs, 0.02, 0.3));
      parts.push('favorito');
    }
  }
  return parts.join(', ');
}

// ─── Tic ──────────────────────────────────────────────────────────────────────

async function loadCandidates(nowMs) {
  const pool = (key, mediaType) => getPool(key, mediaType).catch(() => []);
  const lists = async (mediaType) => {
    const [trendingSection, trending, region, popular, anticipated] = await Promise.all([
      pool('trending_section', mediaType),
      pool('trending', mediaType),
      pool('region_top', mediaType),
      pool('popular', mediaType),
      pool('anticipated', mediaType),
    ]);
    return { trendingSection, trending, region, popular, anticipated };
  };
  const [newMovies, newShows, movies, shows, calendar] = await Promise.all([
    pool('new_releases', 'movie'),
    pool('new_releases', 'tv'),
    lists('movie'),
    lists('tv'),
    pool('calendar_episodes_v3', 'tv'),
  ]);
  return buildCandidates({ newMovies, newShows, movies, shows, calendar }, nowMs, BOT_TZ);
}

/**
 * Pone al día a las cuentas. Sin nada pendiente según el plan, no toca la BD.
 * Devuelve { ran: número de sesiones, skipped: motivo } para el log.
 */
export async function runSocialBotsTick({ now = Date.now(), log = console, force = false } = {}) {
  const dayKey = botDayKey(now);
  const plans = BOTS.map((bot) => ({ handle: bot.handle, due: dueCount(planBotDay(bot, dayKey), now) }));
  const totalDue = plans.reduce((sum, plan) => sum + plan.due, 0);
  if (!force && lastKnownDone.dayKey === dayKey && lastKnownDone.due >= totalDue) {
    return { ran: 0, skipped: 'nothing-due' };
  }
  if (totalDue === 0) {
    lastKnownDone = { dayKey, due: 0 };
    return { ran: 0, skipped: 'nothing-due' };
  }

  if (!accountsCache) await ensureBotAccounts();
  if (!accountsCache?.length) return { ran: 0, skipped: 'no-accounts' };
  const candidates = await loadCandidates(now);

  const midnight = zonedMidnight(dayKey, BOT_TZ);
  const log_ = [];
  const result = await db.transaction(async (tx) => {
    const [lock] = await tx.execute(sql`select pg_try_advisory_xact_lock(${LOCK_KEY}) as locked`);
    if (!lock?.locked) return { ran: 0, skipped: 'locked' };

    const doneToday = await sessionsToday(tx, accountsCache, midnight);
    let ran = 0;
    let pendingAfter = 0;
    for (const account of accountsCache) {
      const due = plans.find((plan) => plan.handle === account.handle)?.due || 0;
      const missing = due - (doneToday.get(account.id) || 0);
      if (missing <= 0) continue;
      const done = await loadDone(tx, account.id, now);
      const sessions = Math.min(missing, MAX_SESSIONS_PER_BOT_PER_TICK);
      for (let i = 0; i < sessions; i += 1) {
        const rng = seededRandom(`${account.handle}|${dayKey}|${(doneToday.get(account.id) || 0) + i}|${now}`);
        const session = chooseSession(rng, account, candidates, done);
        if (!session) break;
        const summary = await runSession(tx, account, { ...session, done }, rng, now);
        log_.push(`${account.username}: ${summary}`);
        ran += 1;
      }
      pendingAfter += Math.max(0, missing - sessions);
      await invalidateLevelState(tx, account.id);
    }
    return { ran, pendingAfter };
  }).catch((err) => {
    // P. ej. alguien borró una cuenta a mano: el próximo tic las vuelve a leer.
    accountsCache = null;
    throw err;
  });

  // Sin pendientes (o sin candidatos), no se vuelve a la BD hasta el próximo
  // instante del plan.
  if (result.skipped !== 'locked' && !result.pendingAfter) lastKnownDone = { dayKey, due: totalDue };
  if (log_.length) log.info?.({ sessions: log_ }, 'social bots acted');
  return result;
}
