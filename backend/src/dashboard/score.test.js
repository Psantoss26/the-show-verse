// backend/src/dashboard/score.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateCandidates, excludeSeen } from './score.js';
import { balanceSoftLimitedContent, softLimitedContentWeight } from './filters.js';

const card = (id, extra = {}) => ({ tmdbId: id, mediaType: 'movie', title: `M${id}`, ...extra });

test('aggregateCandidates scores recommendations above similar and aggregates seeds', async () => {
  const seeds = [
    { tmdbId: 1, mediaType: 'movie', weight: 5, title: 'S1', strongPositive: true },
    { tmdbId: 2, mediaType: 'movie', weight: 2, title: 'S2', strongPositive: false },
  ];
  const fetchSimilar = async (s) => s.tmdbId === 1
    ? { recommendations: [card(10), card(11)], similar: [card(20)] }
    : { recommendations: [card(10)], similar: [] };
  const out = await aggregateCandidates({ seeds, fetchSimilar });
  const c10 = out.find((c) => c.tmdbId === 10);
  const c20 = out.find((c) => c.tmdbId === 20);
  assert.ok(c10.score > c20.score);                 // appears for 2 seeds, rec source
  assert.ok(c10.reasons.some((r) => r.seedTmdbId === 1)); // strongPositive seed → reason
  assert.ok(out[0].score >= out[out.length - 1].score);   // sorted desc
});

test('aggregateCandidates only attaches because-reasons for strongPositive seeds', async () => {
  const seeds = [
    { tmdbId: 1, mediaType: 'movie', weight: 10, title: 'Liked', strongPositive: true },
    { tmdbId: 2, mediaType: 'movie', weight: 2, title: 'JustWatched', strongPositive: false },
  ];
  // Cada seed recomienda un candidato distinto; ambos puntúan, pero solo el de
  // la seed con strongPositive lleva razón "because".
  const fetchSimilar = async (s) => ({
    recommendations: [card(s.tmdbId === 1 ? 10 : 20)],
    similar: [],
  });
  const out = await aggregateCandidates({ seeds, fetchSimilar });
  const fromLiked = out.find((c) => c.tmdbId === 10);
  const fromWatched = out.find((c) => c.tmdbId === 20);
  assert.ok(fromLiked.score > 0 && fromWatched.score > 0); // ambos puntúan
  assert.deepEqual(fromLiked.reasons.map((r) => r.seedTmdbId), [1]); // razón solo del liked
  assert.deepEqual(fromWatched.reasons, []); // el visionado casual no crea "porque viste"
});

test('excludeSeen removes library items', () => {
  const items = [card(10), card(11)];
  assert.deepEqual(excludeSeen(items, new Set(['movie:11'])).map((c) => c.tmdbId), [10]);
});

test('soft-limited animation/documentary content is downweighted unless strongly representative', () => {
  const weakAnimation = card(30, { genreIds: [16], voteAverage: 6.6, voteCount: 300 });
  const strongDocumentary = card(31, { genreIds: [99], voteAverage: 8.1, voteCount: 4000 });
  const drama = card(32, { genreIds: [18], voteAverage: 6.8, voteCount: 400 });

  assert.ok(softLimitedContentWeight(weakAnimation) < softLimitedContentWeight(drama));
  assert.ok(softLimitedContentWeight(strongDocumentary) > softLimitedContentWeight(weakAnimation));
});

test('balanceSoftLimitedContent lowers weaker animation/documentary items without removing them', () => {
  const items = [
    card(42, { genreIds: [99], voteAverage: 8.2, voteCount: 4000 }),
    card(41, { genreIds: [18], voteAverage: 6.8, voteCount: 300 }),
    card(40, { genreIds: [16], voteAverage: 6.4, voteCount: 300 }),
  ];

  const out = balanceSoftLimitedContent(items);
  assert.deepEqual(out.map((c) => c.tmdbId), [42, 41, 40]);
});
