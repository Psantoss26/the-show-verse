// backend/src/dashboard/rotation.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededShuffle, rotateWindow, pickRotating, dayNumber } from './rotation.js';

test('seededShuffle is deterministic per seed and a permutation', () => {
  const a = [1,2,3,4,5,6,7,8];
  const s1 = seededShuffle(a, 42);
  const s2 = seededShuffle(a, 42);
  assert.deepEqual(s1, s2);
  assert.deepEqual([...s1].sort((x,y)=>x-y), a);
  assert.deepEqual(a, [1,2,3,4,5,6,7,8]); // input not mutated
  assert.notDeepEqual(seededShuffle(a, 43), s1);
});

test('rotateWindow returns size items and changes with the seed', () => {
  const a = Array.from({length: 50}, (_,i)=>i);
  const w1 = rotateWindow(a, 100, 20);
  assert.equal(w1.length, 20);
  assert.notDeepEqual(rotateWindow(a, 101, 20), w1);
});

test('pickRotating picks count distinct items deterministically', () => {
  const g = ['a','b','c','d','e'];
  const p = pickRotating(g, 7, 3);
  assert.equal(p.length, 3);
  assert.equal(new Set(p).size, 3);
  assert.deepEqual(pickRotating(g, 7, 3), p);
});

test('dayNumber increments by 1 across a UTC day', () => {
  const d0 = dayNumber(new Date('2026-06-25T10:00:00Z'));
  const d1 = dayNumber(new Date('2026-06-26T10:00:00Z'));
  assert.equal(d1 - d0, 1);
});
