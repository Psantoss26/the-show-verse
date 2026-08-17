// backend/src/level/stats.test.js
import assert from 'node:assert/strict';
import test from 'node:test';

import { assembleLevelStats } from './stats.js';
import { XP_SOURCES } from './rules.js';

test('sin ninguna fila el resultado tiene todas las casillas a cero', () => {
  const stats = assembleLevelStats({});
  for (const source of XP_SOURCES) {
    assert.equal(stats[source.countKey], 0, `${source.countKey} debería ser 0`);
  }
  assert.equal(stats.moviePlays, 0);
  assert.deepEqual(stats.watchDates, []);
});

test('los agregados de historial se copian tal cual', () => {
  const stats = assembleLevelStats({
    history: { movies: 290, moviePlays: 364, episodes: 643, lateNightWatches: 12 },
  });
  assert.equal(stats.movies, 290);
  assert.equal(stats.moviePlays, 364);
  assert.equal(stats.episodes, 643);
  assert.equal(stats.lateNightWatches, 12);
});

test('los revisionados quedan resueltos en las estadísticas, no pendientes de derivar', () => {
  // Regresión: el objeto en blanco deja movieRewatches a 0, así que si stats.js no
  // lo rellena, la derivación de rules.js no se dispara y los revisionados no
  // puntúan nunca (se detectó con datos reales: 74 revisionados → 0 XP).
  const stats = assembleLevelStats({ history: { movies: 290, moviePlays: 364 } });
  assert.equal(stats.movieRewatches, 74);
});

test('los revisionados nunca son negativos aunque los plays no cuadren', () => {
  const stats = assembleLevelStats({ history: { movies: 10, moviePlays: 4 } });
  assert.equal(stats.movieRewatches, 0);
});

test('activeDays sale del número de días distintos, no de un contador aparte', () => {
  const stats = assembleLevelStats({
    watchDates: ['2026-08-15', '2026-08-16', '2026-08-17'],
  });
  assert.equal(stats.activeDays, 3);
  assert.deepEqual(stats.watchDates, ['2026-08-15', '2026-08-16', '2026-08-17']);
});

test('las reseñas separan el total de las extensas', () => {
  const stats = assembleLevelStats({ reviews: { total: 10, long: 4 } });
  assert.equal(stats.reviews, 10);
  assert.equal(stats.longReviews, 4);
});

test('los me gusta suman reseñas y listas en un solo recuento', () => {
  const stats = assembleLevelStats({
    likes: { receivedOnComments: 20, receivedOnLists: 5, givenOnComments: 3, givenOnLists: 2 },
  });
  assert.equal(stats.likesReceived, 25);
  assert.equal(stats.likesGiven, 5);
});

test('las listas traen su tamaño mayor para el logro de lista de autor', () => {
  const stats = assembleLevelStats({ lists: { count: 4, items: 120, largest: 57 } });
  assert.equal(stats.lists, 4);
  assert.equal(stats.listItems, 120);
  assert.equal(stats.largestList, 57);
});

test('los valores nulos, decimales o de texto se normalizan a enteros', () => {
  // Postgres devuelve los COUNT como texto según el driver, y los agregados sin
  // filas devuelven null.
  const stats = assembleLevelStats({
    history: { movies: '290', episodes: null, moviePlays: 12.9 },
    ratings: '341',
    favorites: undefined,
  });
  assert.equal(stats.movies, 290);
  assert.equal(stats.episodes, 0);
  assert.equal(stats.moviePlays, 12);
  assert.equal(stats.ratings, 341);
  assert.equal(stats.favorites, 0);
});

test('los recuentos negativos se descartan en vez de restar XP', () => {
  const stats = assembleLevelStats({ ratings: -50 });
  assert.equal(stats.ratings, 0);
});

test('el ensamblado no arrastra claves ajenas al contrato', () => {
  const stats = assembleLevelStats({ ratings: 5, sospechoso: 'x' });
  assert.equal('sospechoso' in stats, false);
});
