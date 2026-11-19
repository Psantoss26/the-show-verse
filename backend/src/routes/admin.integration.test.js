import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

// Opt-in: solo escribe en una base desechable pasada explícitamente.
test('admin: request_log se llena con el plugin y /stats solo lo ven administradores', {
  skip: !process.env.ADMIN_TEST_DATABASE_URL,
}, async (t) => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.ADMIN_TEST_DATABASE_URL;
  process.env.DATABASE_URL_UNPOOLED = process.env.ADMIN_TEST_DATABASE_URL;
  const admin = randomUUID();
  const normal = randomUUID();
  process.env.ADMIN_USER_IDS = admin;

  const { default: Fastify } = await import('fastify');
  const { db, closeDb } = await import('../db/client.js');
  const { users, requestLog } = await import('../db/schema.js');
  const { inArray, sql } = await import('drizzle-orm');
  const { createRequestLogBuffer } = await import('../lib/requestLog.js');
  const { default: requestLogPlugin, pruneRequestLog } = await import('../plugins/requestLog.js');
  const { default: adminRoutes } = await import('./admin.js');

  await db.insert(users).values([admin, normal].map((id, i) => ({
    id,
    username: `admin-test-${i}-${id.slice(0, 8)}`,
    email: `${id}@example.test`,
  })));

  const buffer = createRequestLogBuffer({
    insert: (rows) => db.insert(requestLog).values(rows),
    flushMs: 0,
  });
  const app = Fastify({ trustProxy: true });
  app.addHook('preHandler', async (req) => {
    req.user = req.headers['x-test-user'] ? { id: req.headers['x-test-user'] } : null;
  });
  app.decorate('requireAuth', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
  });
  await app.register(requestLogPlugin, { buffer, retention: false });
  app.get('/v1/items/:id', async () => ({ ok: true }));
  app.get('/health', async () => ({ ok: true }));
  await app.register(adminRoutes, { prefix: '/v1/admin' });

  t.after(async () => {
    await app.close();
    await db.delete(requestLog).where(inArray(requestLog.userId, [admin, normal]));
    await db.execute(sql`delete from request_log where route like '/v1/items/%' or route like '/nada%'`);
    await db.delete(users).where(inArray(users.id, [admin, normal]));
    await closeDb();
  });

  await app.inject({
    url: '/v1/items/42?x=1',
    headers: {
      'x-test-user': normal,
      'x-forwarded-for': '203.0.113.50',
      'cf-ipcountry': 'ES',
      'x-client-user-agent': 'Mozilla/5.0 (iPhone) Mobile',
    },
  });
  await app.inject({ url: '/nada-que-ver', headers: { 'x-forwarded-for': '198.51.100.7' } });
  await app.inject({ url: '/health' });
  await buffer.flush();

  const rows = await db.execute(sql`
    select method, route, status, user_id, country, ip, user_agent from request_log
     where route in ('/v1/items/:id', '/nada-que-ver') order by id
  `);
  assert.deepEqual([...rows].map((r) => ({ ...r })), [
    { method: 'GET', route: '/v1/items/:id', status: 200, user_id: normal, country: 'ES', ip: '203.0.113.0', user_agent: 'Mozilla/5.0 (iPhone) Mobile' },
    { method: 'GET', route: '/nada-que-ver', status: 404, user_id: null, country: null, ip: '198.51.100.0', user_agent: 'lightMyRequest' },
  ]);

  const me = await app.inject({ url: '/v1/admin/me', headers: { 'x-test-user': normal } });
  assert.deepEqual(me.json(), { admin: false });

  const forbidden = await app.inject({ url: '/v1/admin/stats', headers: { 'x-test-user': normal } });
  assert.equal(forbidden.statusCode, 403);
  const anonymous = await app.inject({ url: '/v1/admin/stats' });
  assert.equal(anonymous.statusCode, 401);

  const res = await app.inject({ url: '/v1/admin/stats?range=1h', headers: { 'x-test-user': admin } });
  assert.equal(res.statusCode, 200);
  const stats = res.json();
  assert.equal(stats.range, '1h');
  assert.equal(stats.bucket, 'minute');
  assert.ok(stats.totals.requests >= 2);
  assert.ok(stats.series.length >= 60);
  assert.ok(stats.topRoutes.some((r) => r.route === '/v1/items/:id'));
  assert.ok(stats.topUsers.some((u) => u.userId === normal && u.count >= 1));
  assert.ok(stats.countries.some((c) => c.country === 'ES'));
  assert.ok(stats.clients.some((c) => c.kind === 'Navegador móvil'));
  assert.ok(stats.recent.some((r) => r.route === '/v1/items/:id' && r.username?.startsWith('admin-test-1')));

  const detail = await app.inject({ url: `/v1/admin/stats/users/${normal}?range=24h`, headers: { 'x-test-user': admin } });
  assert.equal(detail.statusCode, 200);
  const body = detail.json();
  assert.equal(body.user.id, normal);
  assert.equal(body.totals.requests >= 1, true);
  assert.ok(body.recent.every((r) => r.userId === normal));

  const bad = await app.inject({ url: '/v1/admin/stats/users/nope', headers: { 'x-test-user': admin } });
  assert.equal(bad.statusCode, 400);

  // Retención: una fila vieja cae, las recientes se quedan.
  await db.insert(requestLog).values({
    ts: new Date(Date.now() - 100 * 86400000), method: 'GET', route: '/nada-vieja', status: 200, durationMs: 1, userId: normal,
  });
  const deleted = await pruneRequestLog(90);
  assert.ok(deleted >= 1);
  const [{ left }] = await db.execute(sql`select count(*)::int as left from request_log where route = '/nada-vieja'`);
  assert.equal(left, 0);
  const [{ kept }] = await db.execute(sql`select count(*)::int as kept from request_log where route = '/v1/items/:id'`);
  assert.ok(kept >= 1);
});
