import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

// Importación de IMDb (ya resuelta a TMDb): puntuaciones, vistos, pendientes y
// listas, sin duplicar al repetirla. Necesita una Postgres con las migraciones
// aplicadas: LISTS_TEST_DATABASE_URL (se salta sin ella). Crea un usuario
// temporal y lo borra al terminar (en cascada, con todo lo importado).
test('importa una tanda de IMDb sin duplicar', { skip: !process.env.LISTS_TEST_DATABASE_URL }, async (t) => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.LISTS_TEST_DATABASE_URL;
  process.env.DATABASE_URL_UNPOOLED = process.env.LISTS_TEST_DATABASE_URL;
  const { default: Fastify } = await import('fastify');
  const { db, closeDb } = await import('../db/client.js');
  const { userListItems, userLists, userRatings, users, watchHistory, watchlist } = await import('../db/schema.js');
  const { eq } = await import('drizzle-orm');
  const { default: importRoutes } = await import('./import.js');

  const app = Fastify();
  app.addHook('onRequest', async (req) => {
    const id = req.headers['x-test-user'];
    if (id) req.user = { id };
  });
  app.decorate('requireAuth', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
  });
  await app.register(importRoutes, { prefix: '/import' });

  const ana = randomUUID();
  await db.insert(users).values({ id: ana, username: `test-${ana}`, displayName: 'Ana', email: `${ana}@example.test` });
  t.after(async () => {
    await db.delete(users).where(eq(users.id, ana));
    await app.close();
    await closeDb();
  });

  // Ids inventados para no chocar con datos reales de la base de datos.
  const MOVIE = 2_000_000_201;
  const SHOW = 2_000_000_202;
  // Ya visto aquí: la puntuación no añade otro visionado.
  await db.insert(watchHistory).values({ userId: ana, tmdbId: MOVIE, mediaType: 'movie', watchedAt: new Date('2020-01-01T12:00:00Z') });

  const payload = {
    ratings: [
      { tmdbId: MOVIE, mediaType: 'movie', rating: 9, ratedAt: '2024-01-15T12:00:00.000Z', title: 'Peli' },
      { tmdbId: SHOW, mediaType: 'tv', rating: 10, ratedAt: '2023-05-01T12:00:00.000Z', title: 'Serie' },
      { tmdbId: SHOW, mediaType: 'episode', season: 5, episode: 14, rating: 10, ratedAt: '2023-06-02T12:00:00.000Z', title: 'Serie' },
    ],
    history: [
      { tmdbId: MOVIE, mediaType: 'movie', watchedAt: '2024-01-15T12:00:00.000Z' },
      { tmdbId: SHOW, mediaType: 'tv', season: 5, episode: 14, watchedAt: '2023-06-02T12:00:00.000Z', title: 'Serie' },
    ],
    watchlist: [{ tmdbId: SHOW, mediaType: 'tv', title: 'Serie', addedAt: '2024-02-01T12:00:00.000Z' }],
    lists: [{ name: 'Favoritas de IMDb', items: [
      { tmdbId: MOVIE, mediaType: 'movie', title: 'Peli', position: 2, voteAverage: 7.5 },
      { tmdbId: SHOW, mediaType: 'tv', title: 'Serie', position: 1 },
    ] }],
  };
  const chunk = (reset) => app.inject({
    method: 'POST',
    url: '/import/imdb/data/chunk',
    headers: { 'x-test-user': ana },
    payload: { ...payload, reset },
  });

  const first = await chunk(true);
  assert.equal(first.statusCode, 200);
  const result = first.json().chunk;
  assert.deepEqual(
    [result.ratings.imported, result.history.imported, result.watchlist.imported, result.lists.created, result.lists.imported],
    [3, 1, 1, 1, 2],
  );

  // Repetir: las notas se actualizan, nada más se duplica.
  const second = (await chunk(false)).json().chunk;
  assert.deepEqual(
    [second.ratings.imported, second.ratings.updated, second.history.imported, second.watchlist.imported, second.lists.created, second.lists.imported],
    [0, 3, 0, 0, 0, 0],
  );

  const ratings = await db.select().from(userRatings).where(eq(userRatings.userId, ana));
  assert.equal(ratings.length, 3);
  const history = await db.select().from(watchHistory).where(eq(watchHistory.userId, ana));
  assert.equal(history.length, 2);
  assert.equal((await db.select().from(watchlist).where(eq(watchlist.userId, ana))).length, 1);
  const lists = await db.select().from(userLists).where(eq(userLists.userId, ana));
  assert.equal(lists.length, 1);
  assert.equal(lists[0].isPublic, false);
  const items = await db.select().from(userListItems).where(eq(userListItems.listId, lists[0].id));
  assert.deepEqual(items.map((item) => [item.tmdbId, item.position]).sort((a, b) => a[1] - b[1]), [[SHOW, 1], [MOVIE, 2]]);
});
