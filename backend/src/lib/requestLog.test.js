import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  truncateIp,
  routeLabel,
  buildRequestLogEntry,
  shouldLogRequest,
  createRequestLogBuffer,
} from './requestLog.js';

test('truncateIp deja /24 en IPv4 y /48 en IPv6', () => {
  assert.equal(truncateIp('203.0.113.77'), '203.0.113.0');
  assert.equal(truncateIp('::ffff:203.0.113.77'), '203.0.113.0');
  assert.equal(truncateIp('2001:db8:abcd:12:1:2:3:4'), '2001:db8:abcd::');
  assert.equal(truncateIp('2001:db8::1'), '2001:db8:0::');
  assert.equal(truncateIp(''), null);
  assert.equal(truncateIp(null), null);
  assert.equal(truncateIp('no-es-ip'), null);
});

test('routeLabel usa el patrón de la ruta y la ruta real solo si no hay patrón', () => {
  assert.equal(routeLabel({ routeOptions: { url: '/v1/lists/:id' }, url: '/v1/lists/123?x=1' }), '/v1/lists/:id');
  assert.equal(routeLabel({ routeOptions: {}, url: '/wp-login.php?a=b' }), '/wp-login.php');
  assert.equal(routeLabel({ url: '/' + 'a'.repeat(400) }).length, 200);
});

test('shouldLogRequest salta sondas de salud y preflight', () => {
  assert.equal(shouldLogRequest({ method: 'GET', url: '/health' }), false);
  assert.equal(shouldLogRequest({ method: 'GET', url: '/ready' }), false);
  assert.equal(shouldLogRequest({ method: 'OPTIONS', url: '/v1/lists' }), false);
  assert.equal(shouldLogRequest({ method: 'GET', url: '/v1/lists?x=1' }), true);
});

test('buildRequestLogEntry toma país y navegador reenviados por la web', () => {
  const entry = buildRequestLogEntry(
    {
      method: 'post',
      url: '/v1/history',
      routeOptions: { url: '/v1/history' },
      ip: '198.51.100.9',
      user: { id: 'u-1' },
      headers: {
        'cf-ipcountry': 'es',
        'x-client-user-agent': 'Mozilla/5.0 real',
        'user-agent': 'node',
      },
    },
    { statusCode: 201, elapsedTime: 12.6 },
  );
  assert.deepEqual(entry, {
    method: 'POST',
    route: '/v1/history',
    status: 201,
    durationMs: 13,
    userId: 'u-1',
    country: 'ES',
    ip: '198.51.100.0',
    userAgent: 'Mozilla/5.0 real',
  });
});

test('buildRequestLogEntry ignora países desconocidos de Cloudflare', () => {
  const entry = buildRequestLogEntry(
    { method: 'GET', url: '/x', headers: { 'cf-ipcountry': 'XX', 'user-agent': 'ua' } },
    { statusCode: 404, elapsedTime: 1 },
  );
  assert.equal(entry.country, null);
  assert.equal(entry.userId, null);
  assert.equal(entry.userAgent, 'ua');
});

test('el búfer escribe al llenarse un lote y al vaciarlo a mano', async () => {
  const batches = [];
  const buffer = createRequestLogBuffer({
    insert: async (rows) => { batches.push(rows); },
    maxBatch: 2,
    flushMs: 0,
  });
  buffer.push({ n: 1 });
  assert.equal(batches.length, 0);
  buffer.push({ n: 2 });
  await buffer.idle();
  assert.deepEqual(batches, [[{ n: 1 }, { n: 2 }]]);
  buffer.push({ n: 3 });
  await buffer.flush();
  assert.deepEqual(batches[1], [{ n: 3 }]);
  await buffer.close();
});

test('el búfer guarda las filas si la escritura falla y descarta las más viejas al topar', async () => {
  let fail = true;
  const batches = [];
  const errors = [];
  const buffer = createRequestLogBuffer({
    insert: async (rows) => {
      if (fail) throw new Error('db caída');
      batches.push(rows);
    },
    maxBatch: 100,
    maxQueue: 3,
    flushMs: 0,
    onError: (err) => errors.push(err.message),
  });
  for (let n = 1; n <= 5; n += 1) buffer.push({ n });
  await buffer.flush();
  assert.deepEqual(errors, ['db caída']);
  assert.equal(buffer.size(), 3);
  fail = false;
  await buffer.flush();
  assert.deepEqual(batches, [[{ n: 3 }, { n: 4 }, { n: 5 }]]);
  await buffer.close();
});
