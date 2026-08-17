// backend/src/level/store.js
// Caché del cálculo de nivel y persistencia de logros.
//
// El XP se deriva, así que la fila de user_level_state es solo caché: borrarla es
// siempre seguro. Los logros, en cambio, se persisten: un logro conseguido no se
// revoca aunque el recuento que lo desbloqueó baje después.

import { eq, inArray, sql } from 'drizzle-orm';

import { userLevelState, userAchievements } from '../db/schema.js';
import { collectLevelStats } from './stats.js';
import { computeStreaks } from './streaks.js';
import { computeXpBreakdown } from './rules.js';
import { evaluateAchievements, ACHIEVEMENTS } from './achievements.js';
import { levelForXp, progressForXp, tierForLevel } from './curve.js';

// Corto a propósito: añadir un favorito y ver el XP moverse casi al momento pesa
// más que ahorrar unos recuentos. Las mutaciones además invalidan la fila.
export const LEVEL_STATE_TTL_MS = 60 * 1000;

const CATALOG_IDS = new Set(ACHIEVEMENTS.map((a) => a.id));

/** ¿La fila cacheada sigue siendo válida en `now`? */
export function isStateFresh(row, now = new Date()) {
  if (!row) return false;
  const expiresAt = row.expiresAt instanceof Date ? row.expiresAt : new Date(row.expiresAt);
  if (Number.isNaN(expiresAt?.getTime?.())) return false;
  return expiresAt.getTime() > now.getTime();
}

/**
 * Cruza la evaluación del catálogo con lo ya persistido.
 *
 * - Un logro persistido queda desbloqueado aunque hoy no cumpla el umbral.
 * - Los persistidos conservan su `unlockedAt` original.
 * - `newlyUnlocked` son los que hay que insertar (y los que la UI puede celebrar).
 */
export function mergeAchievements(evaluated = {}, unlockedRows = []) {
  const items = Array.isArray(evaluated.items) ? evaluated.items : [];
  const persisted = new Map();
  for (const row of Array.isArray(unlockedRows) ? unlockedRows : []) {
    if (!row?.achievementId || !CATALOG_IDS.has(row.achievementId)) continue;
    persisted.set(row.achievementId, row.unlockedAt ?? null);
  }

  const newlyUnlocked = [];
  const merged = items.map((item) => {
    const wasPersisted = persisted.has(item.id);
    const unlocked = Boolean(item.unlocked) || wasPersisted;
    if (unlocked && !wasPersisted) newlyUnlocked.push(item.id);
    return {
      ...item,
      unlocked,
      unlockedAt: wasPersisted ? persisted.get(item.id) : null,
    };
  });

  return {
    items: merged,
    newlyUnlocked,
    unlockedCount: merged.filter((item) => item.unlocked).length,
    total: merged.length,
  };
}

/** Respuesta pública del nivel de un usuario. */
export function buildLevelPayload({ xp, stats, streaks, achievements, computedAt } = {}) {
  const progress = progressForXp(xp);
  const { earned } = computeXpBreakdown(stats);
  // watchDates son cientos de fechas que solo servían para calcular la racha: no
  // tienen nada que hacer en la respuesta.
  const publicStats = { ...(stats && typeof stats === 'object' ? stats : {}) };
  delete publicStats.watchDates;

  return {
    xp: progress.xp,
    level: progress.level,
    tier: progress.tier,
    progress,
    breakdown: earned,
    stats: publicStats,
    streaks: {
      current: Number(streaks?.current) || 0,
      longest: Number(streaks?.longest) || 0,
      activeDays: Number(streaks?.activeDays) || 0,
      lastActiveDate: streaks?.lastActiveDate ?? null,
    },
    achievements: {
      unlockedCount: achievements?.unlockedCount || 0,
      total: achievements?.total || 0,
      newlyUnlocked: achievements?.newlyUnlocked || [],
      items: achievements?.items || [],
    },
    computedAt: (computedAt instanceof Date ? computedAt : new Date()).toISOString(),
  };
}

/**
 * Resumen mínimo para el chip de nivel de los listados de miembros.
 * El nivel se recalcula desde el XP: si la curva cambia, las filas cacheadas no
 * pueden mostrar un nivel que ya no existe.
 */
export function levelSummaryFromRow(row) {
  if (!row) return null;
  const xp = Number(row.xp) || 0;
  const progress = progressForXp(xp);
  return {
    xp,
    level: progress.level,
    tier: progress.tier,
    percent: progress.percent,
  };
}

/** Recalcula desde cero y persiste el resultado. */
async function recomputeLevelState(db, userId, now) {
  const stats = await collectLevelStats(db, userId);
  const streaks = computeStreaks(stats.watchDates, { today: now });
  const { total: xp, bySource } = computeXpBreakdown(stats);
  const level = levelForXp(xp);
  const tier = tierForLevel(level);

  // watchDates no se persiste: son cientos de fechas cuyo único uso es calcular
  // la racha, que sí se guarda ya resumida.
  const persistableStats = { ...stats };
  delete persistableStats.watchDates;
  const persisted = {
    xp,
    level,
    tier: tier.id,
    breakdown: bySource,
    stats: persistableStats,
    streaks,
    computedAt: now,
    expiresAt: new Date(now.getTime() + LEVEL_STATE_TTL_MS),
  };

  await db
    .insert(userLevelState)
    .values({ userId, ...persisted })
    .onConflictDoUpdate({ target: userLevelState.userId, set: persisted });

  return { xp, level, stats, streaks, computedAt: now };
}

/**
 * Estado de nivel de un usuario, con logros.
 *
 * Recalcula si la caché ha caducado o si se pide `refresh`. Los logros se
 * evalúan siempre (es puro y barato) y los nuevos se persisten.
 */
export async function getLevelState(db, userId, { refresh = false } = {}) {
  const now = new Date();

  const [cached] = await db
    .select()
    .from(userLevelState)
    .where(eq(userLevelState.userId, userId))
    .limit(1);

  let state;
  if (!refresh && isStateFresh(cached, now)) {
    state = {
      xp: Number(cached.xp) || 0,
      level: Number(cached.level) || 1,
      stats: cached.stats || {},
      streaks: cached.streaks || {},
      computedAt: cached.computedAt || now,
    };
  } else {
    state = await recomputeLevelState(db, userId, now);
  }

  const unlockedRows = await db
    .select({
      achievementId: userAchievements.achievementId,
      unlockedAt: userAchievements.unlockedAt,
    })
    .from(userAchievements)
    .where(eq(userAchievements.userId, userId));

  const evaluated = evaluateAchievements({
    stats: state.stats,
    level: levelForXp(state.xp),
    streaks: state.streaks,
  });
  const achievements = mergeAchievements(evaluated, unlockedRows);

  if (achievements.newlyUnlocked.length) {
    await db
      .insert(userAchievements)
      .values(achievements.newlyUnlocked.map((achievementId) => ({ userId, achievementId })))
      .onConflictDoNothing();
    // Los recién insertados llevan la fecha de ahora: evita una segunda lectura.
    for (const item of achievements.items) {
      if (achievements.newlyUnlocked.includes(item.id)) item.unlockedAt = now;
    }
  }

  return buildLevelPayload({ ...state, achievements });
}

/**
 * Marca la caché de nivel de un usuario como caducada. La llaman las rutas que
 * cambian algo que puntúa, para que el XP nuevo se vea en la siguiente lectura.
 * Best-effort: si falla, la fila caduca sola por TTL.
 */
export async function invalidateLevelState(db, userId) {
  if (!userId) return;
  try {
    await db
      .update(userLevelState)
      .set({ expiresAt: sql`now() - interval '1 second'` })
      .where(eq(userLevelState.userId, userId));
  } catch {
    // El XP no es crítico: nunca debe romper la mutación que lo provocó.
  }
}

/**
 * Resúmenes de nivel para varios usuarios a la vez (chips de los listados).
 * Lee solo lo cacheado: un listado de miembros no puede permitirse recalcular
 * decenas de perfiles. Las filas se crean al visitar el perfil y con el script
 * `npm run level:backfill`.
 */
export async function getLevelSummaries(db, userIds) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).filter(Boolean))];
  if (!ids.length) return new Map();

  const rows = await db
    .select({ userId: userLevelState.userId, xp: userLevelState.xp })
    .from(userLevelState)
    .where(inArray(userLevelState.userId, ids));

  return new Map(rows.map((row) => [row.userId, levelSummaryFromRow(row)]));
}
