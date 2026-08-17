// backend/src/level/rules.test.js
import assert from 'node:assert/strict';
import test from 'node:test';

import { XP_WEIGHTS, XP_SOURCES, computeXpBreakdown, emptyLevelStats } from './rules.js';

// Agregados reales de psantos26 en la BD local, que es con lo que se calibró la
// curva. Si estos pesos cambian, este test dice exactamente cuánto se mueve.
const PSANTOS = {
  movies: 290,
  moviePlays: 364,
  episodes: 643,
  completedShows: 10,
  ratings: 341,
  reviews: 3,
  longReviews: 0,
  favorites: 321,
  watchlist: 207,
  lists: 1,
  listItems: 0,
  profileFavorites: 10,
  followers: 1,
  following: 1,
  likesReceived: 0,
  likesGiven: 0,
  activeDays: 353,
};

test('emptyLevelStats deja todos los recuentos a cero', () => {
  const stats = emptyLevelStats();
  for (const source of XP_SOURCES) {
    assert.equal(stats[source.countKey], 0, `${source.countKey} debe arrancar a 0`);
  }
});

test('una cuenta sin actividad no tiene XP ni fuentes visibles', () => {
  const breakdown = computeXpBreakdown(emptyLevelStats());
  assert.equal(breakdown.total, 0);
  assert.deepEqual(breakdown.earned, []);
});

test('el desglose de psantos26 suma los 9.540 XP con los que se calibró la curva', () => {
  const breakdown = computeXpBreakdown(PSANTOS);
  assert.equal(breakdown.total, 9540);
});

test('cada fuente aporta recuento × peso', () => {
  const { bySource } = computeXpBreakdown(PSANTOS);
  assert.deepEqual(bySource.movies, { count: 290, weight: 10, xp: 2900 });
  assert.deepEqual(bySource.episodes, { count: 643, weight: 2, xp: 1286 });
  assert.deepEqual(bySource.ratings, { count: 341, weight: 5, xp: 1705 });
  assert.deepEqual(bySource.reviews, { count: 3, weight: 40, xp: 120 });
  assert.deepEqual(bySource.favorites, { count: 321, weight: 3, xp: 963 });
  assert.deepEqual(bySource.activeDays, { count: 353, weight: 5, xp: 1765 });
});

test('los revisionados se derivan de los plays por encima del primer visionado', () => {
  const { bySource } = computeXpBreakdown({ ...PSANTOS });
  // 364 plays − 290 títulos únicos = 74 revisionados.
  assert.deepEqual(bySource.movieRewatches, { count: 74, weight: 3, xp: 222 });
});

test('menos plays que títulos no genera revisionados negativos', () => {
  // Defensa contra datos incoherentes de un import a medias. Sin `movieRewatches`
  // explícito para que se ejerza la derivación y su recorte a cero.
  const { bySource, total } = computeXpBreakdown({ movies: 10, moviePlays: 4 });
  assert.deepEqual(bySource.movieRewatches, { count: 0, weight: 3, xp: 0 });
  assert.equal(total, 100);
});

test('una reseña larga cobra el peso de reseña más el bonus', () => {
  const { total } = computeXpBreakdown({
    ...emptyLevelStats(),
    reviews: 1,
    longReviews: 1,
  });
  assert.equal(total, XP_WEIGHTS.reviews + XP_WEIGHTS.longReviews);
  assert.equal(total, 60);
});

test('earned lista solo las fuentes con XP, de mayor a menor aportación', () => {
  const { earned } = computeXpBreakdown({
    ...emptyLevelStats(),
    movies: 1,        // 10 XP
    episodes: 100,    // 200 XP
    favorites: 2,     // 6 XP
  });
  assert.deepEqual(
    earned.map((s) => [s.key, s.xp]),
    [['episodes', 200], ['movies', 10], ['favorites', 6]],
  );
});

test('cada fuente del desglose lleva etiqueta en español para la UI', () => {
  const { earned } = computeXpBreakdown({ ...emptyLevelStats(), movies: 1 });
  assert.equal(earned[0].label, 'Películas vistas');
});

test('los recuentos ausentes, nulos o inválidos cuentan como cero', () => {
  const breakdown = computeXpBreakdown({ movies: null, episodes: undefined, ratings: 'x' });
  assert.equal(breakdown.total, 0);
});

test('computeXpBreakdown tolera que no le pasen nada', () => {
  assert.equal(computeXpBreakdown().total, 0);
  assert.equal(computeXpBreakdown(null).total, 0);
});

test('el XP es entero: ninguna fuente introduce decimales', () => {
  const { total } = computeXpBreakdown(PSANTOS);
  assert.equal(Number.isInteger(total), true);
});

test('los pesos sociales premian recibir por encima de dar', () => {
  assert.ok(XP_WEIGHTS.likesReceived > XP_WEIGHTS.likesGiven);
  assert.ok(XP_WEIGHTS.followers > XP_WEIGHTS.following);
});
