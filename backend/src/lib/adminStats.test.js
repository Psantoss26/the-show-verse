import { test } from 'node:test';
import assert from 'node:assert/strict';

import { adminUserIds, isAdminUser } from './admin.js';
import { clientKind, parseStatsRange, summarizeClients, summarizeRoutes } from './adminStats.js';

test('isAdminUser solo acepta ids de ADMIN_USER_IDS', () => {
  const env = { ADMIN_USER_IDS: ' AAA-1 , bbb-2,' };
  assert.deepEqual([...adminUserIds(env)], ['aaa-1', 'bbb-2']);
  assert.equal(isAdminUser({ id: 'aaa-1' }, env), true);
  assert.equal(isAdminUser({ id: 'BBB-2' }, env), true);
  assert.equal(isAdminUser({ id: 'ccc-3' }, env), false);
  assert.equal(isAdminUser(null, env), false);
  assert.equal(isAdminUser({ id: 'aaa-1' }, {}), false);
});

test('parseStatsRange cae en 24h ante valores desconocidos', () => {
  assert.equal(parseStatsRange('7d').bucket, 'hour');
  assert.equal(parseStatsRange('30d').bucket, 'day');
  assert.equal(parseStatsRange('1h').bucket, 'minute');
  assert.equal(parseStatsRange('toString').key, '24h');
  assert.equal(parseStatsRange(undefined).key, '24h');
});

test('clientKind distingue bots, app, móvil y escritorio', () => {
  assert.equal(clientKind('Googlebot/2.1'), 'Bots y scripts');
  assert.equal(clientKind('curl/8.0'), 'Bots y scripts');
  assert.equal(clientKind('okhttp/4.12.0'), 'App Android');
  assert.equal(clientKind('Mozilla/5.0 (Linux; Android 14) Mobile Safari'), 'Navegador móvil');
  assert.equal(clientKind('Mozilla/5.0 (X11; Linux x86_64) Chrome/130'), 'Navegador de escritorio');
  assert.equal(clientKind('node'), 'Servidor');
  assert.equal(clientKind(''), 'Desconocido');
});

test('summarizeClients agrupa y ordena', () => {
  assert.deepEqual(
    summarizeClients([
      { user_agent: 'Mozilla/5.0 (X11) Chrome', count: 3 },
      { user_agent: 'Mozilla/5.0 (iPhone) Mobile', count: 5 },
      { user_agent: 'Mozilla/5.0 (Windows) Firefox', count: 4 },
    ]),
    [
      { kind: 'Navegador de escritorio', count: 7 },
      { kind: 'Navegador móvil', count: 5 },
    ],
  );
});

test('summarizeRoutes ordena por uso, lentitud con mínimo y errores', () => {
  const rows = [
    { method: 'GET', route: '/a', count: 100, avg_ms: 10, p95_ms: 30, errors_4xx: 0, errors_5xx: 0 },
    { method: 'GET', route: '/lenta-sola', count: 1, avg_ms: 9000, p95_ms: 9000, errors_4xx: 0, errors_5xx: 0 },
    { method: 'POST', route: '/b', count: 20, avg_ms: 200, p95_ms: 800, errors_4xx: 2, errors_5xx: 1 },
  ];
  const { topRoutes, slowRoutes, errorRoutes } = summarizeRoutes(rows);
  assert.deepEqual(topRoutes.map((r) => r.route), ['/a', '/b', '/lenta-sola']);
  assert.deepEqual(slowRoutes.map((r) => r.route), ['/b', '/a']);
  assert.deepEqual(errorRoutes.map((r) => r.route), ['/b']);
});
