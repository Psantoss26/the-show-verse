import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildReminders,
  parseEntityKey,
  ratingTargetKey,
  splitAutoCompleted,
} from './notificationsCore.js';

test('parseEntityKey: episodio, película y claves inválidas', () => {
  assert.deepEqual(parseEntityKey('tv:1399:3:9'), { mediaType: 'tv', tmdbId: 1399, season: 3, episode: 9 });
  assert.deepEqual(parseEntityKey('movie:603:0:0'), { mediaType: 'movie', tmdbId: 603, season: null, episode: null });
  assert.equal(parseEntityKey('person:1:0:0'), null);
  assert.equal(parseEntityKey(''), null);
});

test('recordatorios: uno por título, con lo que falta', () => {
  const rows = [
    { tmdbId: 1399, mediaType: 'tv', season: 1, episode: 3, createdAt: '2026-09-20T10:00:00Z' },
    { tmdbId: 1399, mediaType: 'tv', season: 1, episode: 2, createdAt: '2026-09-20T09:00:00Z' },
    { tmdbId: 603, mediaType: 'movie', season: null, episode: null, createdAt: '2026-09-19T09:00:00Z' },
  ];
  const rated = new Set(['movie:603']);
  const reviewed = new Set();
  const out = buildReminders(rows, rated, reviewed);
  assert.equal(out.length, 2);
  assert.equal(out[0].episode, 3); // el visionado más reciente de la serie
  assert.equal(out[0].needsRating, true);
  assert.equal(out[0].needsReview, true);
  assert.equal(out[1].mediaType, 'movie');
  assert.equal(out[1].needsRating, false);
  assert.equal(out[1].needsReview, true);
});

test('recordatorios: nada si lo último ya está puntuado y reseñado', () => {
  const rows = [{ tmdbId: 1399, mediaType: 'tv', season: 1, episode: 3, createdAt: '2026-09-20T10:00:00Z' }];
  const rated = new Set([ratingTargetKey(rows[0])]);
  const reviewed = new Set(['tv:1399']);
  assert.deepEqual(buildReminders(rows, rated, reviewed), []);
});

test('un visto automático no se repite como acción', () => {
  const at = '2026-09-20T10:00:00.000Z';
  const actions = [
    { type: 'watched', tmdbId: 1399, mediaType: 'tv', season: 1, episode: 3, createdAt: at },
    { type: 'watched', tmdbId: 603, mediaType: 'movie', season: null, episode: null, createdAt: at },
    { type: 'rating', tmdbId: 1399, mediaType: 'tv', createdAt: at },
  ];
  const auto = [{ tmdbId: 1399, mediaType: 'tv', season: 1, episode: 3, createdAt: at }];
  const out = splitAutoCompleted(actions, auto);
  assert.deepEqual(out.map((a) => `${a.type}:${a.tmdbId}`), ['watched:603', 'rating:1399']);
});

import { detectContinueWatchingAdds, nextInCollection, showCompletionTime } from './notificationsCore.js';

test('Continuar viendo: primer recibo en curso o tras terminar; no los latidos', () => {
  const out = detectContinueWatchingAdds([
    { id: 1, entityKey: 'tv:1:1:1', observedAt: 't1', completed: false, prevCompleted: null },
    { id: 2, entityKey: 'tv:1:1:1', observedAt: 't2', completed: false, prevCompleted: false },
    { id: 3, entityKey: 'tv:1:1:1', observedAt: 't3', completed: true, prevCompleted: false },
    { id: 4, entityKey: 'tv:1:1:1', observedAt: 't4', completed: false, prevCompleted: true },
  ]);
  assert.deepEqual(out.map((x) => x.id), ['cw:1', 'cw:4']);
  assert.equal(out[0].type, 'cw_added');
  assert.equal(out[0].episode, 1);
});

test('serie completada: el visionado que alcanza los emitidos', () => {
  const complete = (plays) => plays.size >= 3;
  const rows = [
    { season: 1, episode: 1, watchedAt: 'a' },
    { season: 1, episode: 1, watchedAt: 'b' }, // repetido: no suma
    { season: 1, episode: 2, watchedAt: 'c' },
    { season: 1, episode: 3, watchedAt: 'd' },
    { season: 1, episode: 3, watchedAt: 'e' },
  ];
  assert.equal(showCompletionTime(rows, complete), 'd');
  assert.equal(showCompletionTime(rows.slice(0, 3), complete), null);
});

test('colección: la siguiente por estreno, saltando las ya vistas', () => {
  const parts = [
    { id: 3, release_date: '2004-01-01' },
    { id: 1, release_date: '2001-01-01' },
    { id: 2, release_date: '2002-01-01' },
    { id: 4, release_date: '' },
  ];
  assert.equal(nextInCollection(parts, 1).id, 2);
  assert.equal(nextInCollection(parts, 1, new Set([2])).id, 3);
  assert.equal(nextInCollection(parts, 3).id, 4);
  assert.equal(nextInCollection(parts, 4), null);
  assert.equal(nextInCollection(parts, 99), null);
});
