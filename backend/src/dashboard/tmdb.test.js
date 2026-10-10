// backend/src/dashboard/tmdb.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCard } from './tmdb.js';

test('toCard maps a TMDB movie result to the card shape', () => {
  const card = toCard({
    id: 27205, title: 'Inception', poster_path: '/p.jpg', backdrop_path: '/b.jpg',
    vote_average: 8.4, vote_count: 35000, original_language: 'en', origin_country: ['US'], release_date: '2010-07-15', genre_ids: [28, 878], popularity: 50.1,
  }, 'movie');
  assert.deepEqual(card, {
    tmdbId: 27205, mediaType: 'movie', title: 'Inception', posterPath: '/p.jpg',
    backdropPath: '/b.jpg', voteAverage: 8.4, voteCount: 35000, originalLanguage: 'en', originCountry: ['US'], year: 2010, releaseDate: '2010-07-15', genreIds: [28, 878], popularity: 50.1,
  });
});

test('toCard maps a TV result (name/first_air_date) and drops itemless entries', () => {
  const card = toCard({ id: 1399, name: 'GoT', poster_path: '/g.jpg', first_air_date: '2011-04-17', vote_average: 8.4, genre_ids: [18] }, 'tv');
  assert.equal(card.tmdbId, 1399);
  assert.equal(card.title, 'GoT');
  assert.equal(card.year, 2011);
  assert.equal(toCard({ id: 5, title: 'X' }, 'movie'), null); // no poster nor backdrop
});

test('adult results are not exposed as dashboard candidates', () => {
  assert.equal(toCard({ id: 1, poster_path: '/p.jpg', adult: true }, 'movie'), null);
});

test('TMDb bounds parallel requests, retains partial lists and rejects total source failure', async (t) => {
  const originalKey = process.env.TMDB_API_KEY;
  process.env.TMDB_API_KEY = 'test-key';
  t.after(() => { if (originalKey === undefined) delete process.env.TMDB_API_KEY; else process.env.TMDB_API_KEY = originalKey; });
  const { tmdbList } = await import('./tmdb.js?network-test');
  let active = 0, peak = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    active++; peak = Math.max(peak, active);
    const page = Number(url.searchParams.get('page'));
    const failed = url.pathname.includes('unavailable') || page === 1;
    if (failed) { active--; return { ok: false, status: 404 }; }
    return { ok: true, json: async () => {
      await new Promise(resolve => setTimeout(resolve, 2)); active--;
      return { results: [{ id: page, poster_path: '/p.jpg', title: 'Candidate' }] };
    } };
  });
  const items = await tmdbList({ path: '/movie/popular', mediaType: 'movie', pages: 24 });
  assert.equal(items.length, 23);
  assert.ok(peak <= 8 && peak > 1);
  await assert.rejects(tmdbList({ path: '/movie/unavailable', mediaType: 'movie', pages: 2 }), /all pages unavailable/);
});
