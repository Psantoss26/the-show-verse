import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

// Opt-in: this suite only writes to an explicitly supplied disposable database.
test('streaming delivery is atomic, idempotent and ordered across devices', {
  skip: !process.env.STREAMING_TEST_DATABASE_URL,
}, async (t) => {
  // Prevent development .env.local overrides from redirecting this opt-in suite.
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.STREAMING_TEST_DATABASE_URL;
  process.env.DATABASE_URL_UNPOOLED = process.env.STREAMING_TEST_DATABASE_URL;
  const { default: Fastify } = await import('fastify');
  const { db, closeDb } = await import('../db/client.js');
  const { users, connectedAccounts, watchHistory, watchProgress } = await import('../db/schema.js');
  const { eq, and } = await import('drizzle-orm');
  const { hashToken } = await import('../lib/jwt.js');
  const { default: authRoutes } = await import('./auth.js');
  const app = Fastify();
  app.decorate('requireAuth', async (req, reply) => {
    if (!req.headers['x-test-user']) return reply.code(401).send({ error: 'unauthorized' });
    req.user = { id: req.headers['x-test-user'] };
  });
  await app.register(authRoutes, { prefix: '/v1/auth' });
  const uid = randomUUID();
  const token = `tsv_netflix_${randomUUID()}`;
  await db.insert(users).values({ id: uid, username: `test-${uid}`, email: `${uid}@example.test` });
  await db.insert(connectedAccounts).values({ userId: uid, provider: 'netflix', providerUid: uid, accessToken: hashToken(token) });
  t.after(async () => { await db.delete(users).where(eq(users.id, uid)); await app.close(); await closeDb(); });
  const base = { tmdbId: 123, mediaType: 'tv', season: 1, episode: 1, runtimeSeconds: 1000, confidence: 'high' };
  const at = new Date(Date.now() - 60_000).getTime();
  const event = (positionSeconds, offset, extra = {}) => ({ ...base, positionSeconds, eventId: randomUUID(), observedAt: new Date(at + offset).toISOString(), ...extra });
  const send = async payload => {
    const res = await app.inject({ method: 'POST', url: '/v1/auth/netflix/progress', headers: { authorization: `Bearer ${token}` }, payload });
    assert.equal(res.statusCode, 200, res.body);
    return res.json();
  };
  await t.test('lost response and concurrent final pings create exactly one history item', async () => {
    await send(event(300, 0));
    const completion = event(950, 1000);
    const results = await Promise.all([send(completion), send(completion), send({ ...completion, eventId: randomUUID() })]);
    assert.equal(results.filter(r => r.replayed).length, 1);
    const history = await db.select().from(watchHistory).where(eq(watchHistory.userId, uid));
    assert.equal(history.length, 1);
    assert.equal(history[0].watchedAt.toISOString(), completion.observedAt);
  });
  await t.test('a delayed old progress ping cannot resurrect a completed episode', async () => {
    const result = await send(event(400, 500));
    assert.equal(result.ignored, 'stale_event');
    assert.equal((await db.select().from(watchProgress).where(eq(watchProgress.userId, uid))).length, 0);
  });
  await t.test('a new rewatch is counted, and estimated positions never complete', async () => {
    await send(event(100, 2000));
    await send(event(950, 3000));
    assert.equal((await db.select().from(watchHistory).where(eq(watchHistory.userId, uid))).length, 2);
    await send(event(999, 4000, { episode: 2, estimated: true }));
    assert.equal((await db.select().from(watchHistory).where(and(eq(watchHistory.userId, uid), eq(watchHistory.episode, 2)))).length, 0);
  });
  await t.test('shared Netflix emails and multiple devices keep independent tokens', async () => {
    const otherUser = randomUUID();
    await db.insert(users).values({ id: otherUser, username: `test-${otherUser}`, email: `${otherUser}@example.test` });
    try {
      const connect = async (user, deviceId, mobile = false) => {
        const response = await app.inject({ method: 'POST', url: '/v1/auth/netflix/' + (mobile ? 'pair-mobile' : 'connect'),
          headers: { 'x-test-user': user }, payload: { email: 'shared@example.test', deviceId } });
        assert.equal(response.statusCode, 200, response.body);
        return response.json().syncToken;
      };
      const tokens = await Promise.all([connect(uid, randomUUID()), connect(uid, randomUUID()), connect(otherUser, randomUUID()),
        connect(uid, randomUUID(), true), connect(uid, randomUUID(), true)]);
      assert.equal(new Set(tokens).size, 5);
      for (const linkedToken of tokens) {
        const response = await app.inject({ method: 'POST', url: '/v1/auth/netflix/progress',
          headers: { authorization: `Bearer ${linkedToken}` }, payload: event(200, 6000, { tmdbId: 999 }) });
        assert.equal(response.statusCode, 200, response.body);
      }
    } finally { await db.delete(users).where(eq(users.id, otherUser)); }
  });
  await t.test('revoked tokens are rejected', async () => {
    await db.delete(connectedAccounts).where(eq(connectedAccounts.userId, uid));
    const response = await app.inject({ method: 'POST', url: '/v1/auth/netflix/progress', headers: { authorization: `Bearer ${token}` }, payload: event(500, 5000) });
    assert.equal(response.statusCode, 401);
  });
});
