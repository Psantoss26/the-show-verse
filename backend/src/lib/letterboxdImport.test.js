import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapLetterboxdHistoryItem,
  mapLetterboxdRatingItem,
  selectLetterboxdHistory,
} from './letterboxdImport.js';

const keyOf = (item) =>
  [item.tmdbId, item.mediaType, item.season ?? '', item.episode ?? '', new Date(item.watchedAt).toISOString()].join(':');

test('mapea visionados y descarta los que no tienen película o fecha', () => {
  const row = mapLetterboxdHistoryItem({ tmdbId: 603, watchedAt: '2023-05-14T12:00:00.000Z', title: 'Matrix' }, 'u1');
  assert.equal(row.mediaType, 'movie');
  assert.equal(row.season, null);
  assert.equal(row.watchedAt.toISOString(), '2023-05-14T12:00:00.000Z');
  assert.equal(mapLetterboxdHistoryItem({ tmdbId: 0, watchedAt: '2023-05-14' }, 'u1'), null);
  assert.equal(mapLetterboxdHistoryItem({ tmdbId: 603, watchedAt: 'nope' }, 'u1'), null);
});

test('mapea puntuaciones 1–10 con su fecha', () => {
  const now = new Date('2024-01-01T00:00:00Z');
  const row = mapLetterboxdRatingItem({ tmdbId: 603, rating: 9, ratedAt: '2022-02-02T12:00:00.000Z' }, 'u1', now);
  assert.equal(row.rating, 9);
  assert.equal(row.ratedAt.toISOString(), '2022-02-02T12:00:00.000Z');
  assert.equal(mapLetterboxdRatingItem({ tmdbId: 603, rating: 11 }, 'u1', now), null);
  assert.equal(mapLetterboxdRatingItem({ tmdbId: 603, rating: 7 }, 'u1', now).ratedAt, now);
});

test('no duplica visionados ni marca otra vez las películas ya vistas', () => {
  const existing = [
    { tmdbId: 1, mediaType: 'movie', season: null, episode: null, watchedAt: new Date('2023-01-01T12:00:00Z') },
    { tmdbId: 2, mediaType: 'movie', season: null, episode: null, watchedAt: new Date('2020-01-01T12:00:00Z') },
  ];
  const items = [
    { tmdbId: 1, watchedAt: '2023-01-01T12:00:00.000Z' }, // ya está
    { tmdbId: 1, watchedAt: '2024-03-01T12:00:00.000Z' }, // rewatch del diario
    { tmdbId: 1, watchedAt: '2024-03-01T12:00:00.000Z' }, // repetido en la tanda
    { tmdbId: 2, watchedAt: '2021-06-01T12:00:00.000Z', undated: true }, // ya vista
    { tmdbId: 3, watchedAt: '2021-06-01T12:00:00.000Z', undated: true }, // nueva
  ];
  const values = selectLetterboxdHistory(items, existing, 'u1', keyOf);
  assert.deepEqual(
    values.map((row) => [row.tmdbId, row.watchedAt.toISOString()]),
    [
      [1, '2024-03-01T12:00:00.000Z'],
      [3, '2021-06-01T12:00:00.000Z'],
    ],
  );
});
