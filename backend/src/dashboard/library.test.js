// backend/src/dashboard/library.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeeds, libraryBasisHash } from './library.js';

test('buildSeeds weights and caps to 25', () => {
  const seeds = buildSeeds({
    favorites: [{ tmdbId: 1, mediaType: 'movie' }],
    ratings: [{ tmdbId: 1, mediaType: 'movie', rating: 9 }, { tmdbId: 2, mediaType: 'tv', rating: 7 }],
    history: [{ tmdbId: 3, mediaType: 'movie' }],
    watchlist: [{ tmdbId: 4, mediaType: 'movie' }],
  });
  const m1 = seeds.find((s) => s.tmdbId === 1 && s.mediaType === 'movie');
  assert.ok(m1.weight >= 9); // favorite(4)+rating9(5)
  assert.ok(seeds[0].weight >= seeds[seeds.length - 1].weight); // sorted desc
  assert.ok(seeds.length <= 25);
});

test('libraryBasisHash changes when library changes', () => {
  const base = { favorites: [{ tmdbId: 1, mediaType: 'movie' }], ratings: [], history: [], watchlist: [] };
  const h1 = libraryBasisHash(base);
  const h2 = libraryBasisHash({ ...base, favorites: [...base.favorites, { tmdbId: 2, mediaType: 'tv' }] });
  assert.notEqual(h1, h2);
  assert.equal(libraryBasisHash(base), h1);
});
