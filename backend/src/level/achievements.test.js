// backend/src/level/achievements.test.js
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACHIEVEMENTS,
  ACHIEVEMENT_FAMILIES,
  ACHIEVEMENT_RARITIES,
  buildAchievementMetrics,
  evaluateAchievements,
} from './achievements.js';
import { emptyLevelStats } from './rules.js';

const NO_STREAKS = { current: 0, longest: 0, activeDays: 0, lastActiveDate: null };

function ctx(stats = {}, extra = {}) {
  return {
    stats: { ...emptyLevelStats(), ...stats },
    level: 1,
    streaks: NO_STREAKS,
    ...extra,
  };
}

// ─────────────────────────────────────────────
// Integridad del catálogo
// ─────────────────────────────────────────────
test('los identificadores de logro son únicos', () => {
  const ids = ACHIEVEMENTS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('cada logro está completo y es evaluable', () => {
  for (const a of ACHIEVEMENTS) {
    assert.ok(a.id, 'falta id');
    assert.ok(a.name, `${a.id}: falta nombre`);
    assert.ok(a.description, `${a.id}: falta descripción`);
    assert.ok(ACHIEVEMENT_FAMILIES.includes(a.family), `${a.id}: familia inválida`);
    assert.ok(ACHIEVEMENT_RARITIES.includes(a.rarity), `${a.id}: rareza inválida`);
    assert.ok(a.icon, `${a.id}: falta icono`);
    assert.ok(Number.isInteger(a.threshold) && a.threshold > 0, `${a.id}: umbral inválido`);
    assert.ok(a.metric, `${a.id}: falta métrica`);
  }
});

test('todas las familias tienen al menos un logro', () => {
  for (const family of ACHIEVEMENT_FAMILIES) {
    assert.ok(
      ACHIEVEMENTS.some((a) => a.family === family),
      `la familia ${family} está vacía`,
    );
  }
});

test('toda métrica declarada existe en las métricas calculadas', () => {
  const metrics = buildAchievementMetrics(ctx());
  for (const a of ACHIEVEMENTS) {
    assert.ok(a.metric in metrics, `${a.id}: la métrica ${a.metric} no se calcula`);
  }
});

// ─────────────────────────────────────────────
// Métricas
// ─────────────────────────────────────────────
test('las métricas mezclan estadísticas, nivel y rachas', () => {
  const metrics = buildAchievementMetrics({
    stats: { ...emptyLevelStats(), movies: 12, episodes: 300 },
    level: 7,
    streaks: { current: 3, longest: 21, activeDays: 90, lastActiveDate: '2026-08-17' },
  });
  assert.equal(metrics.movies, 12);
  assert.equal(metrics.episodes, 300);
  assert.equal(metrics.level, 7);
  assert.equal(metrics.longestStreak, 21);
  assert.equal(metrics.currentStreak, 3);
  assert.equal(metrics.activeDays, 90);
});

// ─────────────────────────────────────────────
// Evaluación
// ─────────────────────────────────────────────
test('una cuenta vacía no desbloquea nada', () => {
  const { unlocked } = evaluateAchievements(ctx());
  assert.deepEqual(unlocked, []);
});

test('una cuenta vacía devuelve el catálogo completo como pendiente', () => {
  const { items } = evaluateAchievements(ctx());
  assert.equal(items.length, ACHIEVEMENTS.length);
  assert.ok(items.every((item) => item.unlocked === false));
});

test('alcanzar el umbral desbloquea el logro', () => {
  const { unlocked } = evaluateAchievements(ctx({ movies: 1 }));
  assert.ok(unlocked.includes('primera-pelicula'));
});

test('quedarse a uno del umbral no lo desbloquea', () => {
  const { unlocked } = evaluateAchievements(ctx({ movies: 9 }));
  assert.ok(unlocked.includes('primera-pelicula'));
  assert.ok(!unlocked.includes('diez-peliculas'));
});

test('el progreso de un logro pendiente es su avance real recortado al umbral', () => {
  const { items } = evaluateAchievements(ctx({ movies: 25 }));
  const cincuenta = items.find((item) => item.id === 'cincuenta-peliculas');
  assert.equal(cincuenta.unlocked, false);
  assert.equal(cincuenta.progress.current, 25);
  assert.equal(cincuenta.progress.threshold, 50);
  assert.equal(cincuenta.progress.percent, 50);
});

test('el progreso de un logro desbloqueado no pasa del 100%', () => {
  const { items } = evaluateAchievements(ctx({ movies: 900 }));
  const diez = items.find((item) => item.id === 'diez-peliculas');
  assert.equal(diez.unlocked, true);
  assert.equal(diez.progress.percent, 100);
  assert.equal(diez.progress.current, 10);
});

test('los logros de racha leen la racha máxima, no la actual', () => {
  const withLongStreak = evaluateAchievements(
    ctx({}, { streaks: { current: 1, longest: 30, activeDays: 40, lastActiveDate: null } }),
  );
  assert.ok(withLongStreak.unlocked.includes('racha-siete'));
  assert.ok(withLongStreak.unlocked.includes('racha-treinta'));
});

test('los logros de nivel leen el nivel alcanzado', () => {
  const { unlocked } = evaluateAchievements(ctx({}, { level: 20 }));
  assert.ok(unlocked.includes('veterano'));
  assert.ok(!unlocked.includes('leyenda-viva'));
});

test('los logros sociales dependen de la actividad social', () => {
  const { unlocked } = evaluateAchievements(ctx({ followers: 10, likesReceived: 25 }));
  assert.ok(unlocked.includes('primer-seguidor'));
  assert.ok(unlocked.includes('diez-seguidores'));
  assert.ok(unlocked.includes('veinticinco-me-gusta'));
});

test('los perfiles reales desbloquean un puñado de logros coherente', () => {
  // Agregados de psantos26: nivel 13, 290 pelis, 643 episodios, 341 puntuaciones.
  const { unlocked } = evaluateAchievements({
    stats: {
      ...emptyLevelStats(),
      movies: 290,
      episodes: 643,
      completedShows: 10,
      ratings: 341,
      reviews: 3,
      favorites: 321,
      profileFavorites: 10,
      lists: 1,
    },
    level: 13,
    streaks: { current: 1, longest: 12, activeDays: 353, lastActiveDate: '2026-08-17' },
  });
  assert.ok(unlocked.includes('doscientas-cincuenta-peliculas'));
  assert.ok(unlocked.includes('quinientos-episodios'));
  assert.ok(unlocked.includes('cinco-series-completadas'));
  assert.ok(unlocked.includes('trescientas-puntuaciones'));
  assert.ok(unlocked.includes('doscientos-favoritos'));
  assert.ok(unlocked.includes('racha-siete'));
  // Lo que aún no ha alcanzado sigue pendiente.
  assert.ok(!unlocked.includes('quinientas-peliculas'));
  assert.ok(!unlocked.includes('mil-episodios'));
  assert.ok(!unlocked.includes('diez-resenas'));
  assert.ok(!unlocked.includes('racha-treinta'));
});

test('los items conservan el orden del catálogo para que la rejilla sea estable', () => {
  const { items } = evaluateAchievements(ctx({ movies: 100 }));
  assert.deepEqual(items.map((i) => i.id), ACHIEVEMENTS.map((a) => a.id));
});

test('evaluateAchievements tolera un contexto incompleto', () => {
  assert.deepEqual(evaluateAchievements({}).unlocked, []);
  assert.deepEqual(evaluateAchievements().unlocked, []);
});

// ─────────────────────────────────────────────
// Los recuentos se escriben con cifras, no con letras
// ─────────────────────────────────────────────
// "Quinientos episodios vistos" obliga a leer y traducir mentalmente; "500
// episodios vistos" se compara de un vistazo con el 643 que llevas. Los
// ORDINALES ("tu primera película") se quedan en letra: no son un recuento, y
// "tu 1.ª película" se lee peor.
test('la descripción de cada logro con umbral > 1 contiene su cifra', () => {
  for (const a of ACHIEVEMENTS) {
    if (a.threshold <= 1) continue;
    assert.ok(
      new RegExp(`\\b${a.threshold}\\b`).test(a.description),
      `${a.id}: la descripción debería decir ${a.threshold} con cifras — "${a.description}"`,
    );
  }
});

test('ninguna descripción deletrea un número en letras', () => {
  const enLetras = /\b(dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|veinte|veinticinco|treinta|cincuenta|cien|ciento|doscientos|doscientas|trescientos|trescientas|quinientos|quinientas|mil)\b/i;
  for (const a of ACHIEVEMENTS) {
    const match = enLetras.exec(a.description);
    assert.equal(match, null, `${a.id}: "${match?.[0]}" debería ir en cifras — "${a.description}"`);
  }
});
