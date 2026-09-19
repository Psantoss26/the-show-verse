import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequestCache } from './requestCache.js';
test('concurrent episode lookups share one request; failed lookups remain retryable', async () => {
  const cache = createRequestCache();
  let calls = 0;
  const load = async () => { calls++; return { id: 1 }; };
  await Promise.all([cache('episode', load), cache('episode', load)]);
  assert.equal(calls, 1);
  assert.equal(await cache('failure', async () => null), null);
  assert.deepEqual(await cache('failure', load), { id: 1 });
  assert.equal(calls, 2);
});
