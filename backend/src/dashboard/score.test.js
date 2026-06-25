// backend/src/dashboard/score.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateCandidates, excludeSeen } from './score.js';

const card = (id) => ({ tmdbId: id, mediaType: 'movie', title: `M${id}` });

test('aggregateCandidates scores recommendations above similar and aggregates seeds', async () => {
  const seeds = [{ tmdbId: 1, mediaType: 'movie', weight: 5, title: 'S1' }, { tmdbId: 2, mediaType: 'movie', weight: 2, title: 'S2' }];
  const fetchSimilar = async (s) => s.tmdbId === 1
    ? { recommendations: [card(10), card(11)], similar: [card(20)] }
    : { recommendations: [card(10)], similar: [] };
  const out = await aggregateCandidates({ seeds, fetchSimilar });
  const c10 = out.find((c) => c.tmdbId === 10);
  const c20 = out.find((c) => c.tmdbId === 20);
  assert.ok(c10.score > c20.score);                 // appears for 2 seeds, rec source
  assert.ok(c10.reasons.some((r) => r.seedTmdbId === 1)); // tracks contributing seed
  assert.ok(out[0].score >= out[out.length - 1].score);   // sorted desc
});

test('excludeSeen removes library items', () => {
  const items = [card(10), card(11)];
  assert.deepEqual(excludeSeen(items, new Set(['movie:11'])).map((c) => c.tmdbId), [10]);
});
