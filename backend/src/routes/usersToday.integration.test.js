import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

// Opt-in: solo escribe en una base desechable pasada explícitamente.
test('GET /users/today: ventanas, importaciones, ámbitos y exclusión de la comunidad', {
  skip: !process.env.TODAY_TEST_DATABASE_URL,
}, async (t) => {
  // Evita que .env.local redirija la suite a la Postgres de desarrollo.
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.TODAY_TEST_DATABASE_URL;
  process.env.DATABASE_URL_UNPOOLED = process.env.TODAY_TEST_DATABASE_URL;
  // Sin TMDb: los títulos salen de tmdb_cache.
  delete process.env.TMDB_API_KEY;
  const { default: Fastify } = await import('fastify');
  const { db, closeDb } = await import('../db/client.js');
  const { follows, tmdbCache, titleComments, userPreferences, userRatings, users, watchHistory } = await import('../db/schema.js');
  const { inArray } = await import('drizzle-orm');
  const { default: usersRoutes } = await import('./users.js');

  const app = Fastify();
  app.decorate('requireAuth', async (req, reply) => {
    if (!req.headers['x-test-user']) return reply.code(401).send({ error: 'unauthorized' });
    req.user = { id: req.headers['x-test-user'] };
  });
  await app.register(usersRoutes, { prefix: '/v1/users' });

  const viewer = randomUUID();
  const friend = randomUUID();
  const stranger = randomUUID();
  const hidden = randomUUID();
  const ids = [viewer, friend, stranger, hidden];
  await db.insert(users).values(ids.map((id, i) => ({
    id,
    username: `today-${i}-${id.slice(0, 8)}`,
    email: `${id}@example.test`,
    timezone: 'Europe/Madrid',
  })));
  await db.insert(follows).values({ followerId: viewer, followingId: friend });
  await db.insert(userPreferences).values({ userId: hidden, uiSettings: { hideFromCommunityToday: true } });
  const MOVIE = 990001;
  const SHOW = 990002;
  await db.insert(tmdbCache).values([
    { cacheKey: `movie:${MOVIE}`, data: { title: 'Película de prueba', poster_path: '/p.jpg', release_date: '2026-01-01' }, expiresAt: new Date(Date.now() + 86400000) },
    {
      cacheKey: `tv:${SHOW}`,
      data: {
        name: 'Serie de prueba',
        status: 'Returning Series',
        seasons: [{ season_number: 1, episode_count: 8 }],
        last_episode_to_air: { season_number: 1, episode_number: 8, episode_type: 'finale' },
      },
      expiresAt: new Date(Date.now() + 86400000),
    },
  ]).onConflictDoNothing();
  t.after(async () => {
    await db.delete(users).where(inArray(users.id, ids));
    await db.delete(tmdbCache).where(inArray(tmdbCache.cacheKey, [`movie:${MOVIE}`, `tv:${SHOW}`]));
    await app.close();
    await closeDb();
  });

  // Instantes "reales" (con segundos) dentro de las últimas horas.
  const ago = (minutes) => new Date(Date.now() - minutes * 60_000 - 1234);
  await db.insert(watchHistory).values([
    { userId: friend, tmdbId: SHOW, mediaType: 'tv', season: 1, episode: 7, watchedAt: ago(90) },
    { userId: friend, tmdbId: SHOW, mediaType: 'tv', season: 1, episode: 8, watchedAt: ago(40) },
    { userId: stranger, tmdbId: MOVIE, mediaType: 'movie', watchedAt: ago(30) },
    { userId: hidden, tmdbId: MOVIE, mediaType: 'movie', watchedAt: ago(20) },
    // Importación: tres filas con el mismo instante.
    ...[1, 2, 3].map((episode) => ({ userId: friend, tmdbId: SHOW, mediaType: 'tv', season: 1, episode, watchedAt: ago(10) })),
  ]);
  await db.insert(userRatings).values({ userId: friend, tmdbId: MOVIE, mediaType: 'movie', rating: 8, ratedAt: ago(15) });
  await db.insert(titleComments).values({ tmdbId: MOVIE, mediaType: 'movie', source: 'native', userId: friend, body: 'Me encantó', createdAt: ago(14) });

  const get = async (query) => {
    const res = await app.inject({ method: 'GET', url: `/v1/users/today?${query}`, headers: { 'x-test-user': viewer } });
    return res;
  };

  await t.test('siguiendo: solo el amigo y sin la importación', async () => {
    const res = await get('scope=following&day=today');
    assert.equal(res.statusCode, 200, res.body);
    const body = res.json();
    assert.equal(body.following, 1);
    assert.deepEqual(new Set(body.actions.map((a) => a.user.id)), new Set([friend]));
    assert.equal(body.actions.filter((a) => a.kind === 'watch').length, 2);
    const finale = body.actions.find((a) => a.episode === 8);
    assert.equal(finale.milestone, 'season_finale');
    assert.equal(finale.media.title, 'Serie de prueba');
    assert.equal(body.days[0].key, 'today');
    assert.equal(body.days[0].count, 4);
    assert.equal(body.days.at(-1).key, 'week');
  });

  await t.test('comunidad: incluye desconocidos y respeta la exclusión', async () => {
    const body = (await get('scope=community&day=today')).json();
    const people = new Set(body.actions.map((a) => a.user.id));
    assert.ok(people.has(stranger));
    assert.ok(people.has(friend));
    assert.ok(!people.has(hidden));
  });

  await t.test('ayer está vacío y un día inválido es 400', async () => {
    const body = (await get('scope=following&day=yesterday')).json();
    assert.ok(body.actions.every((a) => new Date(a.activityAt) < new Date(body.range.endAt)));
    assert.equal((await get('day=mañana')).statusCode, 400);
  });
});
