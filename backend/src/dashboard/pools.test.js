// backend/src/dashboard/pools.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupeCards } from './pools.js';

test('dedupeCards removes duplicate mediaType:tmdbId keeping first', () => {
  const a = { tmdbId: 1, mediaType: 'movie', title: 'A' };
  const b = { tmdbId: 1, mediaType: 'movie', title: 'A2' };
  const c = { tmdbId: 1, mediaType: 'tv', title: 'C' };
  assert.deepEqual(dedupeCards([a, b, c]).map((x) => x.title), ['A', 'C']);
});
