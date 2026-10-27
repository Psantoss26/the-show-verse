import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

// Opt-in: solo escribe en una base desechable pasada explícitamente.
test('GET /history: totales de todo el historial en la página 1', {
  skip: !process.env.HISTORY_TEST_DATABASE_URL,
}, async (t) => {
  // Evita que .env.local redirija la suite a la Postgres de desarrollo.
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.HISTORY_TEST_DATABASE_URL;
  process.env.DATABASE_URL_UNPOOLED = process.env.HISTORY_TEST_DATABASE_URL;
  delete process.env.TMDB_API_KEY;
  const { default: Fastify } = await import('fastify');
  const { db, closeDb } = await import('../db/client.js');
  const { users, watchHistory } = await import('../db/schema.js');
  const { eq } = await import('drizzle-orm');
  const { default: historyRoutes } = await import('./history.js');

  const app = Fastify();
  app.decorate('requireAuth', async (req, reply) => {
    if (!req.headers['x-test-user']) return reply.code(401).send({ error: 'unauthorized' });
    req.user = { id: req.headers['x-test-user'] };
  });
  await app.register(historyRoutes, { prefix: '/v1/history' });

  const userId = randomUUID();
  await db.insert(users).values({
    id: userId,
    username: `history-${userId.slice(0, 8)}`,
    email: `${userId}@example.test`,
  });
  t.after(async () => {
    await db.delete(users).where(eq(users.id, userId));
    await app.close();
    await closeDb();
  });

  const at = (minutes) => new Date(Date.now() - minutes * 60_000);
  await db.insert(watchHistory).values([
    // Película vista dos veces y otra una vez.
    { userId, tmdbId: 990101, mediaType: 'movie', watchedAt: at(10) },
    { userId, tmdbId: 990101, mediaType: 'movie', watchedAt: at(20) },
    { userId, tmdbId: 990102, mediaType: 'movie', watchedAt: at(30) },
    // Tres episodios de una serie.
    ...[1, 2, 3].map((episode) => ({ userId, tmdbId: 990201, mediaType: 'tv', season: 1, episode, watchedAt: at(40 + episode) })),
  ]);

  const get = (query) => app.inject({
    method: 'GET',
    url: `/v1/history?${query}`,
    headers: { 'x-test-user': userId },
  }).then((res) => res.json());

  const first = await get('page=1&limit=2');
  assert.equal(first.results.length, 2);
  assert.deepEqual(first.totals, {
    plays: 6,
    movies: 3,
    episodes: 3,
    movieTitles: 2,
    showTitles: 1,
    titles: 3,
  });

  const second = await get('page=2&limit=2');
  assert.equal(second.results.length, 2);
  assert.equal(second.totals, undefined);

  const moviesOnly = await get('page=1&limit=2&type=movie');
  assert.equal(moviesOnly.totals.plays, 3);
  assert.equal(moviesOnly.totals.titles, 2);
});
