import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redisRetryDelay } from './redis.js';

test('redisRetryDelay keeps reconnecting after the previous five-attempt cutoff', () => {
  assert.equal(redisRetryDelay(1), 100);
  assert.equal(redisRetryDelay(5), 500);
  assert.equal(redisRetryDelay(6), 600);
  assert.equal(redisRetryDelay(100), 5000);
});
