import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildReminders,
  parseEntityKey,
  ratingTargetKey,
  splitAutoCompleted,
  watchEventAt,
} from './notificationsCore.js';

test('parseEntityKey: episodio, película y claves inválidas', () => {
  assert.deepEqual(parseEntityKey('tv:1399:3:9'), { mediaType: 'tv', tmdbId: 1399, season: 3, episode: 9 });
  assert.deepEqual(parseEntityKey('movie:603:0:0'), { mediaType: 'movie', tmdbId: 603, season: null, episode: null });
  assert.equal(parseEntityKey('person:1:0:0'), null);
  assert.equal(parseEntityKey(''), null);
});

const at = (h) => `2026-09-20T${String(h).padStart(2, '0')}:00:00.000Z`;

test('recordatorios: película pide nota y reseña; episodio solo nota', () => {
  const rows = [
    { id: 'e3', tmdbId: 1399, mediaType: 'tv', season: 1, episode: 3, createdAt: at(10) },
    { id: 'e2', tmdbId: 1399, mediaType: 'tv', season: 1, episode: 2, createdAt: at(9) },
    { id: 'm', tmdbId: 603, mediaType: 'movie', season: null, episode: null, createdAt: at(8) },
  ];
  const out = buildReminders(rows, new Set(['movie:603']), new Set());
  assert.equal(out.length, 2);
  assert.deepEqual(
    { level: out[0].level, episode: out[0].episode, needsRating: out[0].needsRating, needsReview: out[0].needsReview },
    { level: 'episode', episode: 3, needsRating: true, needsReview: false },
  );
  assert.deepEqual(
    { level: out[1].level, needsRating: out[1].needsRating, needsReview: out[1].needsReview },
    { level: 'movie', needsRating: false, needsReview: true },
  );
});

test('recordatorios: nada si el episodio más reciente ya está puntuado', () => {
  const rows = [
    { id: 'e3', tmdbId: 1399, mediaType: 'tv', season: 1, episode: 3, createdAt: at(10) },
    { id: 'e2', tmdbId: 1399, mediaType: 'tv', season: 1, episode: 2, createdAt: at(9) },
  ];
  const rated = new Set([ratingTargetKey(rows[0])]);
  assert.deepEqual(buildReminders(rows, rated, new Set()), []);
});

test('recordatorios: el episodio que cierra la temporada avisa de la temporada', () => {
  const rows = [{ id: 'e3', tmdbId: 1399, mediaType: 'tv', season: 1, episode: 3, createdAt: at(10) }];
  const completions = new Map([[1399, { seasons: new Map([['e3', 1]]), showRowId: null }]]);
  const [reminder, ...rest] = buildReminders(rows, new Set(), new Set(), { completions });
  assert.equal(rest.length, 0);
  assert.equal(reminder.level, 'season');
  assert.equal(reminder.season, 1);
  assert.equal(reminder.episode, null);
  assert.equal(reminder.needsReview, false);

  // Temporada ya puntuada: vuelve a avisar del episodio.
  const out = buildReminders(rows, new Set(['season:1399:1']), new Set(), { completions });
  assert.equal(out[0].level, 'episode');
});

test('recordatorios: terminar la serie pide nota y reseña de la serie', () => {
  const rows = [{ id: 'e3', tmdbId: 1399, mediaType: 'tv', season: 2, episode: 3, createdAt: at(10) }];
  const completions = new Map([[1399, { seasons: new Map([['e3', 2]]), showRowId: 'e3' }]]);
  let out = buildReminders(rows, new Set(), new Set(), { completions });
  assert.equal(out.length, 1);
  assert.deepEqual(
    { level: out[0].level, season: out[0].season, needsRating: out[0].needsRating, needsReview: out[0].needsReview },
    { level: 'show', season: null, needsRating: true, needsReview: true },
  );

  // Serie puntuada pero sin reseña: sigue el aviso, solo de reseña.
  out = buildReminders(rows, new Set(['tv:1399']), new Set(), { completions });
  assert.equal(out[0].level, 'show');
  assert.equal(out[0].needsRating, false);

  // Serie puntuada y reseñada: baja a la temporada.
  out = buildReminders(rows, new Set(['tv:1399']), new Set(['tv:1399']), { completions });
  assert.equal(out[0].level, 'season');
});

test('recordatorios: temporada anterior terminada y episodio reciente conviven', () => {
  const rows = [
    { id: 's2e1', tmdbId: 1399, mediaType: 'tv', season: 2, episode: 1, createdAt: at(12) },
    { id: 's1e3', tmdbId: 1399, mediaType: 'tv', season: 1, episode: 3, createdAt: at(10) },
  ];
  const completions = new Map([[1399, { seasons: new Map([['s1e3', 1]]), showRowId: null }]]);
  const out = buildReminders(rows, new Set(), new Set(), { completions });
  assert.deepEqual(out.map((r) => r.level), ['episode', 'season']);
});

test('claves de nota: filas de user_ratings y visionados casan', () => {
  assert.equal(ratingTargetKey({ mediaType: 'season', tmdbId: 1, season: 2 }), 'season:1:2');
  assert.equal(ratingTargetKey({ mediaType: 'episode', tmdbId: 1, season: 2, episode: 3 }), 'episode:1:2:3');
  assert.equal(ratingTargetKey({ mediaType: 'tv', tmdbId: 1, season: 2, episode: 3 }), 'episode:1:2:3');
  assert.equal(ratingTargetKey({ mediaType: 'tv', tmdbId: 1 }), 'tv:1');
});

test('momento del aviso: registro manual con fecha pasada, no importaciones', () => {
  const watchedAt = '2026-08-01T10:00:00.000Z';
  const createdAt = '2026-09-20T10:00:00.000Z';
  assert.equal(watchEventAt({ watchedAt, createdAt, singleTitle: true }).toISOString(), createdAt);
  assert.equal(watchEventAt({ watchedAt, createdAt, singleTitle: false }).toISOString(), watchedAt);
  assert.equal(
    watchEventAt({ watchedAt: createdAt, createdAt: watchedAt, singleTitle: true }).toISOString(),
    createdAt,
  );
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

import { completionMarks, detectContinueWatchingAdds, nextInCollection } from './notificationsCore.js';

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

test('temporada y serie terminadas: el visionado que alcanza los emitidos', () => {
  const counts = { 1: 2, 2: 1 };
  const complete = (plays) => plays.size >= 3;
  const rows = [
    { id: 'a', season: 1, episode: 1 },
    { id: 'b', season: 1, episode: 1 }, // repetido: no suma
    { id: 'c', season: 1, episode: 2 },
    { id: 'd', season: 2, episode: 1 },
    { id: 'e', season: 2, episode: 1 },
  ];
  const marks = completionMarks(rows, counts, complete);
  assert.deepEqual([...marks.seasons], [['c', 1], ['d', 2]]);
  assert.equal(marks.showRowId, 'd');

  const partial = completionMarks(rows.slice(0, 2), counts, complete);
  assert.equal(partial.seasons.size, 0);
  assert.equal(partial.showRowId, null);
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
