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

const spec = (key, ids, extra = {}) => ({ key, title: key, mediaType: 'movie', items: ids.map(card), ...extra });
test('fair allocation keeps later overlapping sections populated', () => {
  const ids = Array.from({ length: 60 }, (_, i) => i + 1);
  const rows = assembleRows({ rowSpecs: [spec('a', ids), spec('b', ids), spec('c', ids)],
    perRow: 32, minItems: 12, fairAllocation: true });
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(r => r.items.length), [20, 20, 20]);
  assert.equal(new Set(rows.flatMap(r => r.items.map(c => c.tmdbId))).size, 60);
});
test('sparse personalized rows obey actual seen quota and release rejected reservations', () => {
  const rows = assembleRows({ rowSpecs: [spec('sparse', [1,2,3,4,5], { seenRatioLimit: .2 }), spec('fallback', [1,2,3,4,5,6])],
    seenIds: new Set(['movie:1', 'movie:2', 'movie:3']), perRow: 32, minItems: 4, fairAllocation: true });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].key, 'fallback');
  assert.equal(rows[0].items.length, 6);
});
test('repeats are capped to actual length, separated, and never occur inside a row', () => {
  const ids = Array.from({ length: 12 }, (_, i) => i + 1);
  const rows = assembleRows({ rowSpecs: [spec('a', ids), spec('empty', []), spec('b', ids.map(i => i + 20)),
    spec('c', ids.map(i => i + 40)), spec('d', [...ids, ...ids.map(i => i + 60), 61, 61])],
    perRow: 32, minItems: 12, fairAllocation: true, maxAppearances: 2, repeatRatio: .125 });
  const used = new Map();
  rows.forEach((row, index) => {
    assert.equal(new Set(row.items.map(c => c.tmdbId)).size, row.items.length);
    let repeats = 0;
    for (const c of row.items) {
      if (used.has(c.tmdbId)) { repeats++; assert.ok(index - used.get(c.tmdbId) >= 3); }
      used.set(c.tmdbId, index);
    }
    assert.ok(repeats <= Math.floor(row.items.length * .125));
  });
  assert.equal(rows[3].items.length, 13);
});

test('repeat filling cannot steal a later reservation and inflate that row repeat ratio', () => {
  const ids = Array.from({ length: 12 }, (_, i) => i + 1);
  const rows = assembleRows({ rowSpecs: [spec('a', [...ids, 61,62,63,64]), spec('b', ids.map(i => i + 20)),
    spec('c', ids.map(i => i + 40)), spec('d', Array.from({ length: 12 }, (_, i) => i + 61))],
    perRow: 32, minItems: 12, fairAllocation: true, maxAppearances: 2, repeatRatio: .125 });
  assert.ok(rows[0].items.every(c => c.tmdbId < 61));
  assert.equal(rows[3].items.length, 12);
});

test('allocation invariants hold across sparse, overlapping and seen-heavy libraries', () => {
  let seed = 12345;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let run = 0; run < 100; run++) {
    const seen = new Set(Array.from({ length: 40 }, (_, i) => `movie:${i + 1}`));
    const specs = Array.from({ length: 15 }, (_, i) => spec(String(i),
      Array.from({ length: 70 }, () => Math.floor(random() * 160) + 1),
      i < 4 ? { seenRatioLimit: i % 2 ? .1 : .2 } : {}));
    const rows = assembleRows({ rowSpecs: specs, perRow: 32, minItems: 12, fairAllocation: true,
      seenIds: seen, maxAppearances: 2, repeatRatio: .125 });
    const usage = new Map();
    rows.forEach((row, index) => {
      let repeats = 0;
      const ratio = specs.find(s => s.key === row.key).seenRatioLimit;
      assert.ok(row.items.length >= 12 && row.items.length <= 32);
      if (ratio != null) assert.ok(row.items.filter(c => seen.has(`movie:${c.tmdbId}`)).length <= Math.floor(row.items.length * ratio));
      assert.equal(new Set(row.items.map(c => c.tmdbId)).size, row.items.length);
      for (const c of row.items) {
        const prior = usage.get(c.tmdbId) || [];
        if (prior.length) { repeats++; assert.ok(index - prior.at(-1) >= 3); }
        assert.ok(prior.length < 2);
        usage.set(c.tmdbId, [...prior, index]);
      }
      assert.ok(repeats <= Math.floor(row.items.length * .125));
    });
  }
});
