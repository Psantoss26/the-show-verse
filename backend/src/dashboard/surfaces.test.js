// backend/src/dashboard/surfaces.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SURFACES } from './surfaces.js';

test('each surface defines media types and generic rows', () => {
  for (const key of ['home', 'movies', 'series']) {
    const s = SURFACES[key];
    assert.ok(Array.isArray(s.mediaTypes) && s.mediaTypes.length >= 1);
    assert.ok(s.genericRows.length >= 4);
    for (const r of s.genericRows) assert.ok(r.key && r.title && r.source?.kind);
  }
  assert.deepEqual(SURFACES.movies.mediaTypes, ['movie']);
  assert.deepEqual(SURFACES.series.mediaTypes, ['tv']);
});
