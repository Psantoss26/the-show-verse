// backend/src/dashboard/filters.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { excludeKidsReality, capAsian, isExcludedGenre } from './filters.js';

test('isExcludedGenre flags kids/reality/talk/news, allows general genres', () => {
  assert.equal(isExcludedGenre({ genreIds: [10762] }), true); // Kids
  assert.equal(isExcludedGenre({ genreIds: [10764] }), true); // Reality
  assert.equal(isExcludedGenre({ genreIds: [18, 10763] }), true); // News mixed in
  assert.equal(isExcludedGenre({ genreIds: [18, 28] }), false); // Drama/Acción
  assert.equal(isExcludedGenre({ genreIds: [] }), false);
  assert.equal(isExcludedGenre({}), false);
});

test('excludeKidsReality drops cards in excluded genres', () => {
  const cards = [
    { tmdbId: 1, genreIds: [18] },
    { tmdbId: 2, genreIds: [10764] }, // reality
    { tmdbId: 3, genreIds: [16, 10762] }, // kids
    { tmdbId: 4, genreIds: [35] },
  ];
  const out = excludeKidsReality(cards);
  assert.deepEqual(out.map((c) => c.tmdbId), [1, 4]);
});

test('capAsian keeps all non-Asian and limits Asian to the ratio', () => {
  const rest = Array.from({ length: 10 }, (_, i) => ({ tmdbId: 100 + i, originalLanguage: 'en' }));
  const asian = Array.from({ length: 20 }, (_, i) => ({ tmdbId: 200 + i, originalLanguage: 'ja' }));
  const out = capAsian([...rest, ...asian]);
  const keptAsian = out.filter((c) => c.originalLanguage === 'ja');
  const keptRest = out.filter((c) => c.originalLanguage === 'en');
  assert.equal(keptRest.length, 10); // todos los no-asiáticos se conservan
  assert.equal(keptAsian.length, 4); // round(10 * 0.4) = 4
});

test('capAsian keeps a minimum of Asian titles when the rest is small', () => {
  const rest = [{ tmdbId: 1, originalLanguage: 'es' }];
  const asian = Array.from({ length: 10 }, (_, i) => ({ tmdbId: 200 + i, originalLanguage: 'ko' }));
  const out = capAsian([...rest, ...asian]);
  const keptAsian = out.filter((c) => c.originalLanguage === 'ko');
  assert.equal(keptAsian.length, 3); // max(3, round(1 * 0.4)) = 3
});
