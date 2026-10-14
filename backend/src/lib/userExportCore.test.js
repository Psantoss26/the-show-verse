import assert from 'node:assert/strict';
import test from 'node:test';

import { parseExportSections, shapeUserExport } from './userExportCore.js';

test('parseExportSections filtra secciones desconocidas y vuelve a todas si no queda ninguna', () => {
  assert.deepEqual(parseExportSections('ratings, favorites,ratings,lists'), ['ratings', 'favorites']);
  assert.deepEqual(parseExportSections(''), ['favorites', 'watchlist', 'ratings']);
  assert.deepEqual(parseExportSections('nada'), ['favorites', 'watchlist', 'ratings']);
});

test('shapeUserExport solo incluye las secciones leídas y completa año e IMDb desde la caché', () => {
  const metadataByKey = new Map([
    ['movie:603', { title: 'Matrix', original_title: 'The Matrix', release_date: '1999-03-30', imdb_id: 'tt0133093' }],
    ['tv:1396', { name: 'Breaking Bad', original_name: 'Breaking Bad', first_air_date: '2008-01-20' }],
  ]);
  const data = shapeUserExport({
    user: { id: 'u1', username: 'ana', email: 'ana@example.com' },
    favorites: [{ tmdbId: 603, mediaType: 'movie', title: null, addedAt: new Date('2026-01-02T10:00:00Z') }],
    ratings: [
      { tmdbId: 1396, mediaType: 'episode', title: 'Breaking Bad', season: 0, episode: 3, rating: 9, ratedAt: '2026-06-18T15:11:15Z' },
      { tmdbId: 999, mediaType: 'tv', title: 'Sin caché', season: null, episode: null, rating: 7.5, ratedAt: null },
    ],
    metadataByKey,
    now: new Date('2026-10-14T00:00:00Z'),
  });

  assert.equal(data.exportedAt, '2026-10-14T00:00:00.000Z');
  // Nunca se exportan el id interno ni el correo.
  assert.deepEqual(data.user, { username: 'ana' });
  assert.equal('watchlist' in data, false);

  assert.deepEqual(data.favorites[0], {
    tmdbId: 603,
    mediaType: 'movie',
    title: 'Matrix',
    originalTitle: 'The Matrix',
    year: 1999,
    imdbId: 'tt0133093',
    addedAt: '2026-01-02T10:00:00.000Z',
  });

  const [episode, show] = data.ratings;
  assert.equal(episode.year, 2008);
  assert.equal(episode.season, 0, 'la temporada 0 (especiales) se conserva');
  assert.equal(episode.episode, 3);
  assert.equal(episode.originalTitle, null, 'sin título original si coincide con el título');
  assert.equal(show.year, null);
  assert.equal(show.imdbId, null);
  assert.equal(show.rating, 7.5);
  assert.equal(show.ratedAt, null);
});
