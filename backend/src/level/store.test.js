// backend/src/level/store.test.js
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LEVEL_STATE_TTL_MS,
  isStateFresh,
  mergeAchievements,
  buildLevelPayload,
  levelSummaryFromRow,
} from './store.js';
import { emptyLevelStats } from './rules.js';
import { ACHIEVEMENTS } from './achievements.js';

const NOW = new Date('2026-08-17T12:00:00Z');

// ─────────────────────────────────────────────
// Frescura de la caché
// ─────────────────────────────────────────────
test('sin fila en caché no hay nada fresco', () => {
  assert.equal(isStateFresh(null, NOW), false);
  assert.equal(isStateFresh(undefined, NOW), false);
});

test('una fila sin caducar es fresca', () => {
  const row = { expiresAt: new Date('2026-08-17T12:04:00Z') };
  assert.equal(isStateFresh(row, NOW), true);
});

test('una fila caducada no es fresca', () => {
  const row = { expiresAt: new Date('2026-08-17T11:59:00Z') };
  assert.equal(isStateFresh(row, NOW), false);
});

test('una fila con expiración ilegible se considera caducada', () => {
  assert.equal(isStateFresh({ expiresAt: null }, NOW), false);
  assert.equal(isStateFresh({ expiresAt: 'nunca' }, NOW), false);
});

test('el TTL es corto para que el XP se mueva casi en el momento', () => {
  assert.ok(LEVEL_STATE_TTL_MS <= 5 * 60 * 1000);
  assert.ok(LEVEL_STATE_TTL_MS >= 30 * 1000);
});

// ─────────────────────────────────────────────
// Fusión con los logros persistidos
// ─────────────────────────────────────────────
test('un logro recién alcanzado se marca como nuevo para poder celebrarlo', () => {
  const evaluated = {
    unlocked: ['primera-pelicula'],
    items: [{ id: 'primera-pelicula', unlocked: true }, { id: 'diez-peliculas', unlocked: false }],
  };
  const merged = mergeAchievements(evaluated, []);
  assert.deepEqual(merged.newlyUnlocked, ['primera-pelicula']);
});

test('un logro ya persistido conserva su fecha original de desbloqueo', () => {
  const evaluated = {
    unlocked: ['primera-pelicula'],
    items: [{ id: 'primera-pelicula', unlocked: true }],
  };
  const merged = mergeAchievements(evaluated, [
    { achievementId: 'primera-pelicula', unlockedAt: new Date('2025-03-01T10:00:00Z') },
  ]);
  assert.deepEqual(merged.newlyUnlocked, []);
  assert.equal(
    merged.items[0].unlockedAt.toISOString(),
    '2025-03-01T10:00:00.000Z',
  );
});

test('un logro persistido sigue desbloqueado aunque el recuento haya bajado', () => {
  // Quitar favoritos baja el XP, pero no revoca un logro ya conseguido.
  const evaluated = {
    unlocked: [],
    items: [{ id: 'doscientos-favoritos', unlocked: false, progress: { current: 30, threshold: 200, percent: 15 } }],
  };
  const merged = mergeAchievements(evaluated, [
    { achievementId: 'doscientos-favoritos', unlockedAt: new Date('2026-01-01T00:00:00Z') },
  ]);
  assert.equal(merged.items[0].unlocked, true);
  assert.equal(merged.unlockedCount, 1);
});

test('un logro pendiente no lleva fecha', () => {
  const merged = mergeAchievements(
    { unlocked: [], items: [{ id: 'diez-peliculas', unlocked: false }] },
    [],
  );
  assert.equal(merged.items[0].unlockedAt, null);
});

test('los logros persistidos que ya no están en el catálogo se ignoran', () => {
  const merged = mergeAchievements(
    { unlocked: [], items: [{ id: 'diez-peliculas', unlocked: false }] },
    [{ achievementId: 'logro-retirado', unlockedAt: new Date() }],
  );
  assert.equal(merged.items.length, 1);
  assert.equal(merged.unlockedCount, 0);
});

test('el resumen cuenta desbloqueados sobre el total del catálogo', () => {
  const merged = mergeAchievements(
    { unlocked: ['a'], items: [{ id: 'a', unlocked: true }, { id: 'b', unlocked: false }] },
    [],
  );
  assert.equal(merged.unlockedCount, 1);
  assert.equal(merged.total, 2);
});

// ─────────────────────────────────────────────
// Payload de la API
// ─────────────────────────────────────────────
test('el payload expone nivel, rango, progreso y desglose', () => {
  const payload = buildLevelPayload({
    xp: 9540,
    stats: { ...emptyLevelStats(), movies: 290 },
    streaks: { current: 2, longest: 12, activeDays: 353, lastActiveDate: '2026-08-17' },
    achievements: mergeAchievements({ unlocked: [], items: [] }, []),
    computedAt: NOW,
  });

  assert.equal(payload.xp, 9540);
  assert.equal(payload.level, 13);
  assert.equal(payload.tier.id, 'cinefilo');
  assert.equal(payload.tier.name, 'Cinéfilo');
  assert.equal(payload.progress.percent, 84);
  assert.equal(payload.progress.xpToNextLevel, 210);
  assert.equal(payload.streaks.longest, 12);
  assert.equal(payload.computedAt, NOW.toISOString());
});

test('el desglose del payload solo lista fuentes que aportan XP', () => {
  const payload = buildLevelPayload({
    xp: 2900,
    stats: { ...emptyLevelStats(), movies: 290 },
    streaks: {},
    achievements: mergeAchievements({ unlocked: [], items: [] }, []),
  });
  assert.deepEqual(payload.breakdown.map((s) => s.key), ['movies']);
  assert.equal(payload.breakdown[0].xp, 2900);
});

test('el payload no filtra las fechas de visionado en bruto', () => {
  // watchDates existe para calcular rachas; son cientos de fechas y no aportan
  // nada a la respuesta.
  const payload = buildLevelPayload({
    xp: 0,
    stats: { ...emptyLevelStats(), watchDates: ['2026-08-17'] },
    streaks: {},
    achievements: mergeAchievements({ unlocked: [], items: [] }, []),
  });
  assert.equal('watchDates' in payload.stats, false);
});

// ─────────────────────────────────────────────
// Resumen compacto (chip de nivel en listados)
// ─────────────────────────────────────────────
test('el resumen compacto de una fila cacheada trae lo justo para el chip', () => {
  const summary = levelSummaryFromRow({ xp: 9540, level: 13, tier: 'cinefilo' });
  assert.deepEqual(summary, {
    xp: 9540,
    level: 13,
    tier: { id: 'cinefilo', name: 'Cinéfilo', minLevel: 11, maxLevel: 15, color: 'emerald' },
    percent: 84,
  });
});

test('el resumen recalcula el nivel desde el XP y no se fía del guardado', () => {
  // Si la curva cambia, las filas viejas no deben mostrar un nivel imposible.
  const summary = levelSummaryFromRow({ xp: 150, level: 99, tier: 'leyenda' });
  assert.equal(summary.level, 2);
  assert.equal(summary.tier.id, 'espectador');
});

test('sin fila no hay resumen', () => {
  assert.equal(levelSummaryFromRow(null), null);
});

test('el catálogo entero cabe en el payload de logros', () => {
  const merged = mergeAchievements(
    { unlocked: [], items: ACHIEVEMENTS.map((a) => ({ ...a, unlocked: false })) },
    [],
  );
  assert.equal(merged.total, ACHIEVEMENTS.length);
  assert.equal(merged.items.length, ACHIEVEMENTS.length);
});
