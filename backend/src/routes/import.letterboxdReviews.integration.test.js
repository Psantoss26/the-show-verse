import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

// Reseñas de la exportación de Letterboxd → reseñas nativas de la ficha.
// Necesita una Postgres con las migraciones aplicadas: LISTS_TEST_DATABASE_URL
// (se salta sin ella). Crea un usuario temporal y lo borra al terminar (en
// cascada, con sus reseñas).
test('importa las reseñas de Letterboxd sin duplicar', { skip: !process.env.LISTS_TEST_DATABASE_URL }, async (t) => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.LISTS_TEST_DATABASE_URL;
  process.env.DATABASE_URL_UNPOOLED = process.env.LISTS_TEST_DATABASE_URL;
  const { default: Fastify } = await import('fastify');
  const { db, closeDb } = await import('../db/client.js');
  const { titleComments, users } = await import('../db/schema.js');
  const { and, eq } = await import('drizzle-orm');
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

  // Id inventado para no chocar con reseñas reales de la base de datos.
  const FILM = 2_000_000_101;
  // Ya llegó por el RSS (mismo texto con otros saltos de línea).
  await db.insert(titleComments).values({
    tmdbId: FILM, mediaType: 'movie', source: 'native', userId: ana, authorName: 'Ana',
    body: 'Still perfect.\n\nSecond line', createdAt: new Date('2024-01-02T20:00:00Z'),
  });

  const chunk = (reset) => app.inject({
    method: 'POST',
    url: '/import/letterboxd/data/chunk',
    headers: { 'x-test-user': ana },
    payload: {
      reset,
      reviews: [
        { tmdbId: FILM, title: 'Film', body: 'Still perfect.\nSecond line', spoiler: false, reviewedAt: '2024-01-02T12:00:00.000Z' },
        { tmdbId: FILM, title: 'Film', body: 'First watch', spoiler: true, reviewedAt: '2019-03-04T12:00:00.000Z' },
      ],
    },
  });

  const first = await chunk(true);
  assert.equal(first.statusCode, 200);
  assert.deepEqual(
    { fetched: first.json().chunk.reviews.fetched, imported: first.json().chunk.reviews.imported },
    { fetched: 2, imported: 1 },
  );

  // Repetir la importación no duplica nada.
  const second = await chunk(false);
  assert.equal(second.json().chunk.reviews.imported, 0);
  assert.equal(second.json().steps.reviews.imported, 1);

  const rows = await db
    .select()
    .from(titleComments)
    .where(and(eq(titleComments.userId, ana), eq(titleComments.tmdbId, FILM)));
  assert.equal(rows.length, 2);
  const imported = rows.find((row) => row.body === 'First watch');
  assert.equal(imported.spoiler, true);
  assert.equal(imported.source, 'native');
  assert.equal(imported.authorName, 'Ana');
  assert.equal(imported.createdAt.toISOString(), '2019-03-04T12:00:00.000Z');
});
