import assert from 'node:assert/strict';
import test from 'node:test';

import { countActions, summarizeFollowingWindow, summarizeOwnWindow } from './socialSummaryCore.js';

test('los episodios vistos juntos cuentan como una actividad', () => {
  const rows = [
    { userId: 'a', tmdbId: 1, mediaType: 'tv', activityGroup: 'g1', at: '2026-10-30T20:00:00Z' },
    { userId: 'a', tmdbId: 1, mediaType: 'tv', activityGroup: 'g1', at: '2026-10-30T20:00:00Z' },
    { userId: 'b', tmdbId: 1, mediaType: 'tv', activityGroup: 'g1', at: '2026-10-30T20:00:00Z' },
    { userId: 'a', tmdbId: 2, mediaType: 'movie', activityGroup: null, at: '2026-10-31T20:00:00Z' },
  ];
  assert.equal(countActions(rows), 3);
});

test('Siguiendo: personas son las cuentas seguidas y activos las que tienen filas', () => {
  const rows = [
    { userId: 'a', tmdbId: 1, mediaType: 'movie', at: '2026-10-30T20:00:00Z' },
    { userId: 'a', tmdbId: 2, mediaType: 'movie', at: '2026-10-30T21:00:00Z' },
    { userId: 'b', tmdbId: null, mediaType: null, at: '2026-10-31T10:00:00Z' },
  ];
  assert.deepEqual(summarizeFollowingWindow(rows, 12), { actions: 3, people: 12, active: 2 });
  assert.deepEqual(summarizeFollowingWindow([], 0), { actions: 0, people: 0, active: 0 });
});

test('Yo: títulos distintos (temporadas y episodios como su serie) y días locales', () => {
  const rows = [
    { tmdbId: 10, mediaType: 'tv', at: '2026-10-30T22:30:00Z' },
    { tmdbId: 10, mediaType: 'episode', at: '2026-10-30T23:30:00Z' },
    { tmdbId: 10, mediaType: 'movie', at: '2026-10-29T10:00:00Z' },
    { tmdbId: null, mediaType: null, at: '2026-10-29T11:00:00Z' },
  ];
  // En Madrid (UTC+1) las 23:30 UTC del 30 ya son el 31.
  assert.deepEqual(summarizeOwnWindow(rows, 'Europe/Madrid'), { actions: 4, titles: 2, days: 3 });
  assert.deepEqual(summarizeOwnWindow(rows, 'UTC'), { actions: 4, titles: 2, days: 2 });
});
