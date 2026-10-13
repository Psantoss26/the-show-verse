import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  imdbListName,
  mapImdbCollectionItem,
  mapImdbListItem,
  mapImdbRatingItem,
  selectImdbHistory,
} from './imdbImport.js';

const now = new Date('2026-10-13T10:00:00Z');

test('puntuaciones de película, serie y episodio; descarta las inválidas', () => {
  const movie = mapImdbRatingItem({ tmdbId: 603, mediaType: 'movie', rating: 9, ratedAt: '2024-01-15T12:00:00Z', title: 'Matrix' }, 'u1', now);
  assert.equal(movie.mediaType, 'movie');
  assert.equal(movie.season, null);
  assert.equal(movie.ratedAt.toISOString(), '2024-01-15T12:00:00.000Z');

  const episode = mapImdbRatingItem({ tmdbId: 1396, mediaType: 'episode', season: 5, episode: 14, rating: 10 }, 'u1', now);
  assert.deepEqual([episode.mediaType, episode.season, episode.episode], ['episode', 5, 14]);
  assert.equal(episode.ratedAt, now);

  assert.equal(mapImdbRatingItem({ tmdbId: 1396, mediaType: 'tv', rating: 11 }, 'u1'), null);
  assert.equal(mapImdbRatingItem({ tmdbId: 1396, mediaType: 'episode', rating: 8 }, 'u1'), null);
  assert.equal(mapImdbRatingItem({ tmdbId: 1, mediaType: 'season', rating: 8 }, 'u1'), null);
});

test('vistos: una vez por título y solo si aún no está visto', () => {
  const existing = [
    { tmdbId: 603, mediaType: 'movie', season: null, episode: null },
    { tmdbId: 1396, mediaType: 'tv', season: 5, episode: 13 },
  ];
  const rows = selectImdbHistory(
    [
      { tmdbId: 603, mediaType: 'movie', watchedAt: '2024-01-15T12:00:00Z' },
      { tmdbId: 550, mediaType: 'movie', watchedAt: '2024-01-16T12:00:00Z' },
      { tmdbId: 550, mediaType: 'movie', watchedAt: '2020-01-01T12:00:00Z' },
      { tmdbId: 1396, mediaType: 'tv', season: 5, episode: 13, watchedAt: '2023-06-01T12:00:00Z' },
      { tmdbId: 1396, mediaType: 'tv', season: 5, episode: 14, watchedAt: '2023-06-02T12:00:00Z' },
      { tmdbId: 1396, mediaType: 'tv', watchedAt: '2023-06-02T12:00:00Z' },
      { tmdbId: 1, mediaType: 'movie' },
    ],
    existing,
    'u1',
  );
  assert.deepEqual(rows.map((row) => [row.tmdbId, row.mediaType, row.season, row.episode]), [
    [550, 'movie', null, null],
    [1396, 'tv', 5, 14],
  ]);
  assert.equal(rows[0].watchedAt.toISOString(), '2024-01-16T12:00:00.000Z');
});

test('watchlist y listas solo con películas y series', () => {
  assert.equal(mapImdbCollectionItem({ tmdbId: 1396, mediaType: 'tv' }, 'u1', now).addedAt, now);
  assert.equal(mapImdbCollectionItem({ tmdbId: 1396, mediaType: 'episode' }, 'u1'), null);
  const item = mapImdbListItem({ tmdbId: 603, mediaType: 'movie', position: 3, voteAverage: 8.2, addedAt: '2024-03-01T12:00:00Z' }, 'l1', now);
  assert.deepEqual([item.listId, item.position, item.voteAverage], ['l1', 3, 8.2]);
  assert.equal(mapImdbListItem({ tmdbId: 603, mediaType: 'movie', voteAverage: 0 }, 'l1', now).voteAverage, null);
  assert.equal(imdbListName(`  Mis   pelis  ${'x'.repeat(200)}`).length, 100);
});
