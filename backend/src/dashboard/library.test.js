// backend/src/dashboard/library.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeeds, libraryBasisHash } from './library.js';

test('buildSeeds weights watchlist above ratings/favorites/history', () => {
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
  assert.equal(w(5), 10);       // watchlist (SEÑAL PRINCIPAL)
  assert.equal(w(1), 6);        // rating 9
  assert.equal(w(2, 'tv'), 4);  // rating 8
  assert.equal(w(10), 4);       // favorito
  assert.equal(w(3), 2);        // rating 7
  assert.equal(w(4), 1);        // historial
  assert.equal(w(9), undefined); // rating 4 no genera semilla
  // jerarquía: watchlist > rating9 > rating8 = favorito > rating7 > historial
  assert.ok(w(5) > w(1) && w(1) > w(2, 'tv') && w(2, 'tv') === w(10) && w(10) > w(3) && w(3) > w(4));
  assert.ok(seeds[0].weight >= seeds[seeds.length - 1].weight); // ordenado desc
  // la watchlist es ahora la semilla de más peso → encabeza la lista
  assert.equal(seeds[0].tmdbId, 5);
  assert.ok(seeds.length <= 25);
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
  assert.equal(s1.weight, 5);          // rating8(4) + historial(1)
  assert.equal(s1.strongPositive, true);
});

test('libraryBasisHash changes when library changes', () => {
  const base = { favorites: [{ tmdbId: 1, mediaType: 'movie' }], ratings: [], history: [], watchlist: [] };
  const h1 = libraryBasisHash(base);
  const h2 = libraryBasisHash({ ...base, favorites: [...base.favorites, { tmdbId: 2, mediaType: 'tv' }] });
  assert.notEqual(h1, h2);
  assert.equal(libraryBasisHash(base), h1);
});
