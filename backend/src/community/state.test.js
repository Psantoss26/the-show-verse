import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedDecision, retryBackoffMs } from './state.js';

const now = 1_000_000_000_000;

test('missing state → seed', () => {
  assert.equal(seedDecision(null, now), 'seed');
});
test('pending → seed', () => {
  assert.equal(seedDecision({ status: 'pending' }, now), 'seed');
});
test('ready → serve', () => {
  assert.equal(seedDecision({ status: 'ready' }, now), 'serve');
});
test('seeding → wait', () => {
  assert.equal(seedDecision({ status: 'seeding' }, now), 'wait');
});
test('failed within backoff → serve', () => {
  const nextRetryAt = new Date(now + 60_000);
  assert.equal(seedDecision({ status: 'failed', nextRetryAt }, now), 'serve');
});
test('failed past backoff → seed', () => {
  const nextRetryAt = new Date(now - 60_000);
  assert.equal(seedDecision({ status: 'failed', nextRetryAt }, now), 'seed');
});
test('retry backoff grows with attempts', () => {
  assert.equal(retryBackoffMs(0), 6 * 60 * 60 * 1000);
  assert.ok(retryBackoffMs(2) > retryBackoffMs(0));
});
