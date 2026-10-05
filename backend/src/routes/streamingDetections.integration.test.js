import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

// Opt-in, como streamingProgress.integration.test.js: solo escribe en una base
// desechable indicada explícitamente y con las migraciones aplicadas.
test('streaming detections: corrections fix stored data and teach the resolver', {
  skip: !process.env.STREAMING_TEST_DATABASE_URL,
}, async (t) => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.STREAMING_TEST_DATABASE_URL;
  process.env.DATABASE_URL_UNPOOLED = process.env.STREAMING_TEST_DATABASE_URL;
  process.env.DETECTION_GLOBAL_MIN_SUPPORTERS = '2';
  const { default: Fastify } = await import('fastify');
  const { db, closeDb } = await import('../db/client.js');
  const { users, connectedAccounts, watchHistory, watchProgress, detectionRules } = await import('../db/schema.js');
  const { eq, inArray } = await import('drizzle-orm');
  const { hashToken } = await import('../lib/jwt.js');
  const { default: authRoutes } = await import('./auth.js');
  const { default: detectionRoutes } = await import('./streamingDetections.js');

  const app = Fastify();
  app.decorate('requireAuth', async (req, reply) => {
    if (!req.headers['x-test-user']) return reply.code(401).send({ error: 'unauthorized' });
    req.user = { id: req.headers['x-test-user'] };
  });
  await app.register(authRoutes, { prefix: '/v1/auth' });
  await app.register(detectionRoutes, { prefix: '/v1/streaming' });

  const makeUser = async () => {
    const id = randomUUID();
    const token = `tsv_netflix_${randomUUID()}`;
    await db.insert(users).values({ id, username: `test-${id}`, email: `${id}@example.test` });
    await db.insert(connectedAccounts).values({ userId: id, provider: 'netflix', providerUid: id, accessToken: hashToken(token) });
    return { id, token };
  };
  const created = [];
  const user = async () => { const u = await makeUser(); created.push(u.id); return u; };
  t.after(async () => {
    await db.delete(users).where(inArray(users.id, created));
    await db.delete(detectionRules).where(eq(detectionRules.owner, 'global'));
    await app.close();
    await closeDb();
  });

  const call = async (method, url, { token, userId, payload } = {}) => {
    const headers = {};
    if (token) headers.authorization = `Bearer ${token}`;
    if (userId) headers['x-test-user'] = userId;
    const res = await app.inject({ method, url, headers, payload });
    return { status: res.statusCode, json: res.json() };
  };
  const FP = 'netflix|top 10 en espana';
  const record = (u, extra = {}) => call('POST', '/v1/streaming/detections', {
    token: u.token,
    payload: {
      platform: 'netflix', kind: 'playback', fingerprint: FP, triggerText: 'Top 10 en España',
      signal: { mainTitle: 'Top 10 en España', season: 2, episode: 3 },
      tmdbId: 500, mediaType: 'tv', season: 2, episode: 3, title: 'Serie equivocada', confidence: 'medium',
      ...extra,
    },
  });
  const ping = (u, detectionId, positionSeconds, extra = {}) => call('POST', '/v1/auth/netflix/progress', {
    token: u.token,
    payload: {
      tmdbId: 500, mediaType: 'tv', season: 2, episode: 3, positionSeconds, runtimeSeconds: 1000,
      eventId: randomUUID(), observedAt: new Date().toISOString(), detectionId, ...extra,
    },
  });
  const lookup = (u) => call('POST', '/v1/streaming/detections/lookup', {
    token: u.token, payload: { platform: 'netflix', fingerprint: FP },
  });

  await t.test('recording requires a valid sync token and reuses a recent identical detection', async () => {
    const u = await user();
    assert.equal((await record({ token: 'nope' })).status, 401);
    const first = await record(u);
    assert.equal(first.status, 201);
    const again = await record(u);
    assert.equal(again.json.detectionId, first.json.detectionId);
    assert.equal(again.json.reused, true);
  });

  await t.test('wrong title: progress and history move to the chosen title and later pings follow', async () => {
    const u = await user();
    const { json: { detectionId } } = await record(u);
    await ping(u, detectionId, 300);
    // Un visionado completo de ESTA detección y otro ajeno del mismo título.
    await ping(u, detectionId, 950);
    await ping(u, detectionId, 100, { episode: 4 });
    await db.insert(watchHistory).values({ userId: u.id, tmdbId: 500, mediaType: 'tv', season: 1, episode: 1 });

    const res = await call('POST', `/v1/streaming/detections/${detectionId}/correction`, {
      userId: u.id,
      payload: { verdict: 'wrong_title', tmdbId: 66732, mediaType: 'tv', season: 2, episode: 3, title: 'Stranger Things', posterPath: '/st.jpg' },
    });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json.detection.status, 'corrected');

    const history = await db.select().from(watchHistory).where(eq(watchHistory.userId, u.id));
    const moved = history.filter((h) => h.tmdbId === 66732);
    assert.equal(moved.length, 1);
    assert.deepEqual([moved[0].season, moved[0].episode, moved[0].title], [2, 3, 'Stranger Things']);
    // El visionado que no era de esta detección no se toca.
    assert.equal(history.filter((h) => h.tmdbId === 500).length, 1);

    const progress = await db.select().from(watchProgress).where(eq(watchProgress.userId, u.id));
    assert.deepEqual(progress.map((p) => [p.tmdbId, p.season, p.episode]), [[66732, 2, 3]]);

    // Un reproductor que sigue abierto manda el título viejo: se redirige.
    await ping(u, detectionId, 400, { episode: 4 });
    const after = await db.select().from(watchProgress).where(eq(watchProgress.userId, u.id));
    assert.ok(after.every((p) => p.tmdbId === 66732));

    const rules = await lookup(u);
    assert.equal(rules.json.decision.rule, 'override');
    assert.equal(rules.json.decision.tmdbId, 66732);
    assert.deepEqual(rules.json.rejects, [{ tmdbId: 500, mediaType: 'tv' }]);
  });

  await t.test('not a title: stored data is removed, pings are ignored and the text is published', async () => {
    const u = await user();
    const { json: { detectionId } } = await record(u, { kind: 'detail' });
    await ping(u, detectionId, 300);
    const res = await call('POST', `/v1/streaming/detections/${detectionId}/correction`, {
      userId: u.id, payload: { verdict: 'not_a_title' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.data.progressRemoved, 1);
    const ignored = await ping(u, detectionId, 500);
    assert.equal(ignored.json.ignored, 'detection_dismissed');
    assert.equal((await db.select().from(watchProgress).where(eq(watchProgress.userId, u.id))).length, 0);

    assert.equal((await lookup(u)).json.decision.rule, 'not_a_title');
    const list = await call('GET', '/v1/streaming/rules/not-a-title', { token: u.token });
    assert.deepEqual(list.json.platforms.netflix, ['top 10 en espana']);
  });

  await t.test('one user\'s correction is personal until enough users agree', async () => {
    const a = await user();
    const b = await user();
    const c = await user();
    const correct = async (u) => {
      const { json: { detectionId } } = await record(u, { fingerprint: 'netflix|dark', triggerText: 'Dark', tmdbId: 700 });
      return call('POST', `/v1/streaming/detections/${detectionId}/correction`, {
        userId: u.id, payload: { verdict: 'wrong_title', tmdbId: 70523, mediaType: 'tv', title: 'Dark' },
      });
    };
    const darkLookup = (u) => call('POST', '/v1/streaming/detections/lookup', {
      token: u.token, payload: { platform: 'netflix', fingerprint: 'netflix|dark' },
    });
    await correct(a);
    assert.equal((await darkLookup(c)).json.decision, null);
    await correct(b);
    const global = (await darkLookup(c)).json;
    assert.equal(global.decision.scope, 'global');
    assert.equal(global.decision.tmdbId, 70523);
  });

  await t.test('sessions only see and correct their own detections', async () => {
    const owner = await user();
    const other = await user();
    const { json: { detectionId } } = await record(owner);
    assert.equal((await call('GET', `/v1/streaming/detections/${detectionId}`, { userId: other.id })).status, 404);
    assert.equal((await call('POST', `/v1/streaming/detections/${detectionId}/correction`, {
      userId: other.id, payload: { verdict: 'not_a_title' },
    })).status, 404);
    const list = await call('GET', '/v1/streaming/detections', { userId: owner.id });
    assert.equal(list.json.results.length, 1);
    assert.equal(list.json.results[0].detectedSeason, 2);
  });
});
