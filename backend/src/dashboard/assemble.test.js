// backend/src/dashboard/assemble.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleRows } from './assemble.js';

const card = (id) => ({ tmdbId: id, mediaType: 'movie', title: `M${id}` });

test('assembleRows cross-dedupes across rows in order', () => {
  const rows = assembleRows({
    perRow: 2, rotationSeed: 1,
    rowSpecs: [
      { key: 'a', title: 'A', reason: null, mediaType: 'movie', items: [card(1), card(2), card(3)], rotate: false },
      { key: 'b', title: 'B', reason: null, mediaType: 'movie', items: [card(2), card(3), card(4)], rotate: false },
    ],
  });
  assert.deepEqual(rows[0].items.map((c) => c.tmdbId), [1, 2]);
  assert.deepEqual(rows[1].items.map((c) => c.tmdbId), [3, 4]); // 2 already used
});

test('assembleRows drops empty rows and honors excludeIds', () => {
  const rows = assembleRows({
    perRow: 5, rotationSeed: 1, excludeIds: new Set(['movie:1']),
    rowSpecs: [{ key: 'a', title: 'A', reason: null, mediaType: 'movie', items: [card(1)], rotate: false }],
  });
  assert.equal(rows.length, 0);
});
