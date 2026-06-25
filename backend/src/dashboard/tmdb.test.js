// backend/src/dashboard/tmdb.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCard } from './tmdb.js';

test('toCard maps a TMDB movie result to the card shape', () => {
  const card = toCard({
    id: 27205, title: 'Inception', poster_path: '/p.jpg', backdrop_path: '/b.jpg',
    vote_average: 8.4, vote_count: 35000, release_date: '2010-07-15', genre_ids: [28, 878], popularity: 50.1,
  }, 'movie');
  assert.deepEqual(card, {
    tmdbId: 27205, mediaType: 'movie', title: 'Inception', posterPath: '/p.jpg',
    backdropPath: '/b.jpg', voteAverage: 8.4, voteCount: 35000, year: 2010, genreIds: [28, 878], popularity: 50.1,
  });
});

test('toCard maps a TV result (name/first_air_date) and drops itemless entries', () => {
  const card = toCard({ id: 1399, name: 'GoT', poster_path: '/g.jpg', first_air_date: '2011-04-17', vote_average: 8.4, genre_ids: [18] }, 'tv');
  assert.equal(card.tmdbId, 1399);
  assert.equal(card.title, 'GoT');
  assert.equal(card.year, 2011);
  assert.equal(toCard({ id: 5, title: 'X' }, 'movie'), null); // no poster nor backdrop
});
