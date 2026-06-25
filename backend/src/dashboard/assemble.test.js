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

test('assembleRows allows seen freely in generic rows (no seenRatioLimit)', () => {
  const rows = assembleRows({
    perRow: 3, rotationSeed: 1,
    seenIds: new Set(['movie:1', 'movie:2', 'movie:3']),
    rowSpecs: [
      { key: 'g', title: 'Populares', mediaType: 'movie', rotate: false,
        items: [card(1), card(2), card(3)] },
    ],
  });
  // las filas genéricas muestran títulos ya vistos
  assert.deepEqual(rows[0].items.map((c) => c.tmdbId), [1, 2, 3]);
});

test('assembleRows caps seen items in personalized rows via seenRatioLimit', () => {
  // perRow 4, ratio 0.25 → máximo 1 visto. items: 1(visto),2(visto),3,4,5
  const rows = assembleRows({
    perRow: 4, rotationSeed: 1,
    seenIds: new Set(['movie:1', 'movie:2']),
    rowSpecs: [
      { key: 'p', title: 'Para ti', mediaType: 'movie', rotate: false, seenRatioLimit: 0.25,
        items: [card(1), card(2), card(3), card(4), card(5)] },
    ],
  });
  const ids = rows[0].items.map((c) => c.tmdbId);
  assert.equal(ids.length, 4);
  const seenInRow = ids.filter((id) => id === 1 || id === 2).length;
  assert.equal(seenInRow, 1);            // solo 1 visto permitido
  assert.deepEqual(ids, [1, 3, 4, 5]);   // el 2 se salta por el límite de vistos
});
