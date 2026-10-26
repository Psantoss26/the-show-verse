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

  // `uidPrefix` simula el emparejamiento real: 'mobile:' (app Android) o
  // 'browser:' (extensión). Sin prefijo, la detección queda sin origen.
  const makeUser = async (uidPrefix = '') => {
    const id = randomUUID();
    const token = `tsv_netflix_${randomUUID()}`;
    await db.insert(users).values({ id, username: `test-${id}`, email: `${id}@example.test` });
    await db.insert(connectedAccounts).values({ userId: id, provider: 'netflix', providerUid: `${uidPrefix}${id}`, accessToken: hashToken(token) });
    return { id, token };
  };
  const created = [];
  const user = async (uidPrefix) => { const u = await makeUser(uidPrefix); created.push(u.id); return u; };
  // Mismo usuario con un segundo dispositivo vinculado (otro token).
  const addDevice = async (u, uidPrefix) => {
    const token = `tsv_netflix_${randomUUID()}`;
    await db.insert(connectedAccounts).values({ userId: u.id, provider: 'netflix', providerUid: `${uidPrefix}${randomUUID()}`, accessToken: hashToken(token) });
    return { id: u.id, token };
  };
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

  await t.test('mobile detections live in the app: the web lists only the extension ones', async () => {
    const phone = await user('mobile:');
    const browser = await addDevice(phone, 'browser:');
    const { json: { detectionId: fromPhone } } = await record(phone);
    const { json: { detectionId: fromBrowser } } = await record(browser, { fingerprint: 'netflix|otra', triggerText: 'Otra' });

    const web = await call('GET', '/v1/streaming/detections', { userId: phone.id });
    assert.deepEqual(web.json.results.map((d) => d.id), [fromBrowser]);

    const device = await call('GET', '/v1/streaming/device/detections', { token: phone.token });
    assert.equal(device.status, 200);
    assert.deepEqual(device.json.results.map((d) => d.id), [fromPhone]);

    const one = await call('GET', `/v1/streaming/device/detections/${fromPhone}`, { token: phone.token });
    assert.equal(one.json.detection.id, fromPhone);
  });

  await t.test('the app corrects with its token; the extension token cannot use the app endpoints', async () => {
    const phone = await user('mobile:');
    const browser = await addDevice(phone, 'browser:');
    const { json: { detectionId } } = await record(phone);

    assert.equal((await call('GET', '/v1/streaming/device/detections', {})).status, 401);
    assert.equal((await call('GET', '/v1/streaming/device/detections', { token: browser.token })).status, 403);

    const res = await call('POST', `/v1/streaming/device/detections/${detectionId}/correction`, {
      token: phone.token, payload: { verdict: 'not_a_title' },
    });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json.detection.status, 'corrected');

    const stranger = await user('mobile:');
    assert.equal((await call('POST', `/v1/streaming/device/detections/${detectionId}/correction`, {
      token: stranger.token, payload: { verdict: 'not_a_title' },
    })).status, 404);
  });

  // ── Mapa de ids de contenido ───────────────────────────────────────────────
  const cid = () => String(Math.floor(Math.random() * 1e12));
  const lookupId = (u, contentId, platform = 'netflix') => call('POST', '/v1/streaming/detections/lookup', {
    token: u.token, payload: { platform, fingerprint: '', contentId },
  });
  const recordId = (u, contentId, extra = {}) => record(u, {
    contentId, confidence: 'high', tmdbId: 66732, title: 'Stranger Things', season: 4, episode: 5, ...extra,
  });

  await t.test('a confident playback teaches its content id to the user, and to others by consensus', async () => {
    const id = cid();
    const [a, b, c] = [await user(), await user(), await user()];
    assert.equal((await lookupId(a, id)).json.content, null);

    await recordId(a, id);
    const own = await lookupId(a, id);
    assert.equal(own.status, 200, JSON.stringify(own.json));
    assert.deepEqual(
      [own.json.content.scope, own.json.content.source, own.json.content.tmdbId, own.json.content.season, own.json.content.episode],
      ['user', 'auto', 66732, 4, 5],
    );
    // Uno solo no basta para los demás (mínimo 2 en esta prueba).
    assert.equal((await lookupId(c, id)).json.content, null);
    await recordId(b, id);
    const global = await lookupId(c, id);
    assert.deepEqual([global.json.content.scope, global.json.content.supporters], ['global', 2]);
    // La huella sigue funcionando a la vez que el id.
    const both = await call('POST', '/v1/streaming/detections/lookup', {
      token: c.token, payload: { platform: 'netflix', fingerprint: FP, contentId: id },
    });
    assert.ok(Array.isArray(both.json.rejects));
    assert.equal(both.json.content.tmdbId, 66732);
  });

  await t.test('only confident playback of an item-level id is learned', async () => {
    const u = await user();
    const [low, detail, prime, showLevel, fromMap] = [cid(), cid(), cid(), cid(), cid()];
    await recordId(u, low, { confidence: 'medium' });
    await recordId(u, detail, { kind: 'detail' });
    await recordId(u, prime, { platform: 'primevideo' });
    await recordId(u, showLevel, { episode: null });
    await recordId(u, fromMap, { source: 'content_id' });
    for (const id of [low, detail, showLevel, fromMap]) {
      assert.equal((await lookupId(u, id)).json.content, null, id);
    }
    assert.equal((await lookupId(u, prime, 'primevideo')).json.content, null);
    assert.equal((await call('POST', '/v1/streaming/detections/lookup', {
      token: u.token, payload: { platform: 'netflix', fingerprint: '' },
    })).status, 400);
  });

  await t.test('a correction pins the content id and later automatic resolutions do not undo it', async () => {
    const u = await user();
    const id = cid();
    const { json: { detectionId } } = await recordId(u, id);
    const res = await call('POST', `/v1/streaming/detections/${detectionId}/correction`, {
      userId: u.id,
      payload: { verdict: 'wrong_title', tmdbId: 1396, mediaType: 'tv', season: 2, episode: 1, title: 'Breaking Bad' },
    });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    let content = (await lookupId(u, id)).json.content;
    assert.deepEqual([content.source, content.tmdbId, content.season, content.episode], ['correction', 1396, 2, 1]);

    await recordId(u, id, { tmdbId: 500, title: 'Otra' });
    content = (await lookupId(u, id)).json.content;
    assert.deepEqual([content.source, content.tmdbId], ['correction', 1396]);

    // «No era ningún título»: el id deja de saberse qué es.
    const again = await recordId(u, id, { tmdbId: 1396, season: 2, episode: 1, source: 'content_id', fingerprint: 'netflix|otra cosa' });
    await call('POST', `/v1/streaming/detections/${again.json.detectionId}/correction`, {
      userId: u.id, payload: { verdict: 'not_a_title' },
    });
    assert.equal((await lookupId(u, id)).json.content, null);
  });

  // ── Descartes y resumen por plataforma ─────────────────────────────────────
  const discard = (u, extra = {}) => call('POST', '/v1/streaming/discards', {
    token: u.token,
    payload: {
      platform: 'movistar', kind: 'playback', reason: 'unresolved', triggerText: 'Serie rara',
      fingerprint: 'movistar|serie rara', signal: { mainTitle: 'Serie rara' }, ...extra,
    },
  });

  await t.test('a discarded observation is stored once per burst, with its reason and client', async () => {
    const phone = await user('mobile:');
    assert.equal((await discard({ token: 'nope' })).status, 401);
    assert.equal((await discard(phone, { reason: 'whatever' })).status, 400);

    const first = await discard(phone);
    assert.equal(first.status, 201, JSON.stringify(first.json));
    const again = await discard(phone, { signal: { mainTitle: 'Serie rara', episode: 2 } });
    assert.deepEqual([again.json.discardId, again.json.reused], [first.json.discardId, true]);
    // Otro motivo u otro id de contenido es otra observación.
    assert.notEqual((await discard(phone, { reason: 'empty_title' })).json.discardId, first.json.discardId);
    assert.notEqual((await discard(phone, { contentId: '42' })).json.discardId, first.json.discardId);

    const all = await call('GET', '/v1/streaming/discards', { userId: phone.id });
    assert.equal(all.status, 200);
    assert.equal(all.json.results.length, 3);
    const merged = all.json.results.find((r) => r.id === first.json.discardId);
    assert.deepEqual([merged.attempts, merged.origin, merged.signal.episode], [2, 'android', 2]);
    // La web (origin=browser) no enseña lo del móvil.
    assert.equal((await call('GET', '/v1/streaming/discards?origin=browser', { userId: phone.id })).json.results.length, 0);
    assert.equal((await call('GET', '/v1/streaming/discards', {})).status, 401);
  });

  await t.test('stats summarize detections, corrections and discards per platform and client', async () => {
    const u = await user('browser:');
    const phone = await addDevice(u, 'mobile:');
    const a = await record(u, { fingerprint: 'netflix|uno', confidence: 'high' });
    await record(u, { fingerprint: 'netflix|dos', confidence: 'high', source: 'content_id' });
    await record(phone, { fingerprint: 'netflix|tres' });
    await call('POST', `/v1/streaming/detections/${a.json.detectionId}/correction`, {
      userId: u.id, payload: { verdict: 'not_a_title' },
    });
    await discard(u, { platform: 'netflix', reason: 'unresolved' });
    await discard(u, { platform: 'netflix', reason: 'unresolved' });
    await discard(phone, { platform: 'movistar', reason: 'empty_title', triggerText: '' });

    const all = await call('GET', '/v1/streaming/stats?days=7', { userId: u.id });
    assert.equal(all.status, 200, JSON.stringify(all.json));
    assert.deepEqual(all.json.platforms.map((p) => p.platform), ['netflix', 'movistar']);
    const netflix = all.json.platforms[0];
    assert.deepEqual(
      [netflix.detected, netflix.corrected, netflix.discarded, netflix.discardedAttempts],
      [3, 1, 1, 2],
    );
    assert.deepEqual(netflix.bySource, { search: 2, content_id: 1 });
    assert.deepEqual(netflix.byOrigin.android, { detected: 1, corrected: 0, discarded: 0 });
    assert.equal(netflix.successRate, 0.5);
    assert.deepEqual(all.json.totals.byReason, { unresolved: 1, empty_title: 1 });

    const browser = await call('GET', '/v1/streaming/stats?origin=browser', { userId: u.id });
    assert.deepEqual(browser.json.platforms.map((p) => [p.platform, p.detected, p.discarded]), [['netflix', 2, 1]]);
    assert.equal((await call('GET', '/v1/streaming/stats?days=99', { userId: u.id })).status, 400);
    assert.equal((await call('GET', '/v1/streaming/stats', {})).status, 401);
  });
});
