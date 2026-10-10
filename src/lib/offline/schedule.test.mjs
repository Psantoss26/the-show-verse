import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldPrepareAutomatically, AUTO_PREPARE_INTERVAL_MS, DATA_CHANGE_INTERVAL_MS } from './schedule.js';

const now = 1_800_000_000_000;
const last = (ago, build = 'b1') => ({ updatedAt: now - ago, build });

test('the first copy on a device always runs', () => {
  assert.equal(shouldPrepareAutomatically({ last: null, build: 'b1', now }), true);
});

test('opening the app again does not repeat a recent copy', () => {
  assert.equal(shouldPrepareAutomatically({ last: last(10 * 60 * 1000), build: 'b1', now }), false);
  assert.equal(shouldPrepareAutomatically({ last: last(AUTO_PREPARE_INTERVAL_MS), build: 'b1', now }), true);
});

test('a write does not relaunch the full copy more than once an hour', () => {
  assert.equal(shouldPrepareAutomatically({ last: last(5 * 60 * 1000), build: 'b1', reason: 'data', now }), false);
  assert.equal(shouldPrepareAutomatically({ last: last(DATA_CHANGE_INTERVAL_MS), build: 'b1', reason: 'data', now }), true);
});

test('a new deploy refreshes the saved pages once', () => {
  assert.equal(shouldPrepareAutomatically({ last: last(60 * 1000, 'b0'), build: 'b1', now }), true);
});

test('an interrupted copy is resumed', () => {
  assert.equal(shouldPrepareAutomatically({ last: last(60 * 1000), build: 'b1', pending: true, now }), true);
});
