// backend/src/dashboard/library.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeeds, libraryBasisHash } from './library.js';

test('buildSeeds prioritizes explicit enjoyment over pending and passive viewing', () => {
  const seeds = buildSeeds({
    favorites: [{ tmdbId: 10, mediaType: 'movie' }],
    ratings: [
      { tmdbId: 1, mediaType: 'movie', rating: 9 },
      { tmdbId: 2, mediaType: 'tv', rating: 8 },
      { tmdbId: 3, mediaType: 'movie', rating: 7 },
      { tmdbId: 9, mediaType: 'movie', rating: 4 }, // valoración baja → no semilla
    ],
    history: [{ tmdbId: 4, mediaType: 'movie' }],
    watchlist: [{ tmdbId: 5, mediaType: 'movie' }],
  });
  const w = (id, mt = 'movie') => seeds.find((s) => s.tmdbId === id && s.mediaType === mt)?.weight;
  assert.equal(w(1), 10);
  assert.equal(w(2, 'tv'), 7);
  assert.equal(w(10), 6);
  assert.equal(w(3), 4);
  assert.equal(w(5), 3);
  assert.equal(w(4), 1);
  assert.equal(w(9), undefined);
  assert.equal(seeds[0].tmdbId, 1);
});

test('buildSeeds marks strongPositive only for rating>=8 or favorite', () => {
  const seeds = buildSeeds({
    favorites: [{ tmdbId: 10, mediaType: 'movie' }],
    ratings: [
      { tmdbId: 1, mediaType: 'movie', rating: 9 },
      { tmdbId: 2, mediaType: 'movie', rating: 8 },
      { tmdbId: 3, mediaType: 'movie', rating: 7 },
    ],
    history: [{ tmdbId: 4, mediaType: 'movie' }],
    watchlist: [{ tmdbId: 5, mediaType: 'movie' }],
  });
  const sp = (id) => seeds.find((s) => s.tmdbId === id)?.strongPositive;
  assert.equal(sp(1), true);  // rating 9
  assert.equal(sp(2), true);  // rating 8
  assert.equal(sp(10), true); // favorito
  assert.equal(sp(3), false); // rating 7 (secundaria, no "porque viste")
  assert.equal(sp(4), false); // historial
  assert.equal(sp(5), false); // watchlist
});

test('buildSeeds combines signals and flags strongPositive when any qualifies', () => {
  const seeds = buildSeeds({
    favorites: [],
    ratings: [{ tmdbId: 1, mediaType: 'movie', rating: 8 }],
    history: [{ tmdbId: 1, mediaType: 'movie' }],
    watchlist: [],
  });
  const s1 = seeds.find((s) => s.tmdbId === 1);
  assert.equal(s1.weight, 8);          // rating8(7) + historial(1)
  assert.equal(s1.strongPositive, true);
});

test('libraryBasisHash changes when library changes', () => {
  const base = { favorites: [{ tmdbId: 1, mediaType: 'movie' }], ratings: [], history: [], watchlist: [] };
  const h1 = libraryBasisHash(base);
  const h2 = libraryBasisHash({ ...base, favorites: [...base.favorites, { tmdbId: 2, mediaType: 'tv' }] });
  assert.notEqual(h1, h2);
  assert.equal(libraryBasisHash(base), h1);
});

test('dislike overrides favorite and pending signals; repeated history does not inflate weight', () => {
  const seeds = buildSeeds({ favorites: [{ tmdbId: 1, mediaType: 'movie' }],
    watchlist: [{ tmdbId: 1, mediaType: 'movie' }], ratings: [{ tmdbId: 1, mediaType: 'movie', rating: 3 }],
    history: [{ tmdbId: 2, mediaType: 'tv' }, { tmdbId: 2, mediaType: 'tv' }] });
  assert.deepEqual(seeds.map(s => [s.tmdbId, s.weight]), [[2, 1]]);
});
test('film-heavy library retains TV seeds and exact rating changes invalidate cache', () => {
  const lib = { favorites: Array.from({ length: 50 }, (_, i) => ({ tmdbId: i + 1, mediaType: 'movie' })),
    ratings: [{ tmdbId: 100, mediaType: 'tv', rating: 8 }], history: [], watchlist: [] };
  assert.equal(buildSeeds(lib).filter(s => s.mediaType === 'movie').length, 25);
  assert.equal(buildSeeds(lib).filter(s => s.mediaType === 'tv').length, 1);
  assert.notEqual(libraryBasisHash(lib), libraryBasisHash({ ...lib, ratings: [{ ...lib.ratings[0], rating: 9 }] }));
  assert.equal(libraryBasisHash(lib), libraryBasisHash({ ...lib, favorites: [...lib.favorites].reverse() }));
});
