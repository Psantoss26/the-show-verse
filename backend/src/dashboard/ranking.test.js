import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankRowItems, publicQuality, MIXED_GENRES } from './ranking.js';
const card = (id, extra = {}) => ({ tmdbId: id, mediaType: 'movie', voteAverage: 8, voteCount: 5000, ...extra });

test('quality trusts a representative sample over a handful of perfect votes', () => {
  assert.ok(publicQuality(card(1)) > publicQuality(card(2, { voteAverage: 10, voteCount: 3 })));
});
test('editorial rankings preserve source order regardless of affinity or seed', () => {
  const row = { key: 'trending', mediaType: 'movie', rotate: false, items: [card(2), card(1)] };
  assert.deepEqual(rankRowItems(row, { recommendations: new Map([['movie:1', 1000]]) }), row.items);
});
test('personal ranking is deterministic, balances types, and keeps strong matches first', () => {
  const row = { key: 'for_you', mediaType: 'mixed', rotate: true, seenRatioLimit: .2,
    items: [card(1, { score: 100 }), ...Array.from({ length: 60 }, (_, i) => card(i + 2, { score: 2 })),
      card(1, { mediaType: 'tv', score: 100 }), card(2, { mediaType: 'tv', score: 1 })] };
  const ranked = rankRowItems(row, { seed: 42 });
  assert.deepEqual(ranked, rankRowItems(row, { seed: 42 }));
  assert.deepEqual(ranked.slice(0, 2).map(c => [c.mediaType, c.tmdbId]), [['movie', 1], ['tv', 1]]);
});
test('near-equal personalized candidates vary across dashboards', () => {
  const row = { key: 'for_you', mediaType: 'movie', rotate: true, seenRatioLimit: .2,
    items: Array.from({ length: 100 }, (_, i) => card(i + 1, { score: 10 })) };
  const home = rankRowItems(row, { seed: 42, cohortSeed: 42, surface: 'home' }).slice(0, 20);
  const movie = rankRowItems(row, { seed: 1051, cohortSeed: 42, surface: 'movies' }).slice(0, 20);
  assert.ok(movie.filter(c => home.some(h => h.tmdbId === c.tmdbId)).length < 10);
});
test('mixed genre definitions use native TV taxonomy', () => {
  assert.deepEqual(MIXED_GENRES.find(g => g.id === 28).tv, [10759]);
  assert.deepEqual(MIXED_GENRES.find(g => g.id === 878).tv, [10765]);
});
