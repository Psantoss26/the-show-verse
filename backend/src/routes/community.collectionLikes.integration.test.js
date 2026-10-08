import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

// Me gusta en colecciones de TMDb: idempotentes, públicos y por visitante.
// Necesita una Postgres con las migraciones aplicadas: LISTS_TEST_DATABASE_URL
// (se salta sin ella). Crea dos usuarios temporales y los borra al terminar (en
// cascada, con sus me gusta).
test('me gusta en colecciones', { skip: !process.env.LISTS_TEST_DATABASE_URL }, async (t) => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.LISTS_TEST_DATABASE_URL;
  process.env.DATABASE_URL_UNPOOLED = process.env.LISTS_TEST_DATABASE_URL;
  const { default: Fastify } = await import('fastify');
  const { db, closeDb } = await import('../db/client.js');
  const { users } = await import('../db/schema.js');
  const { inArray } = await import('drizzle-orm');
  const { default: communityRoutes } = await import('./community.js');

  const app = Fastify();
  app.addHook('onRequest', async (req) => {
    const id = req.headers['x-test-user'];
    if (id) req.user = { id };
  });
  app.decorate('requireAuth', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
  });
  await app.register(communityRoutes, { prefix: '/community' });

  const [ana, bea] = [randomUUID(), randomUUID()];
  await db.insert(users).values([ana, bea].map((id) => ({
    id, username: `test-${id}`, displayName: 'Prueba', email: `${id}@example.test`,
  })));
  t.after(async () => {
    await db.delete(users).where(inArray(users.id, [ana, bea]));
    await app.close();
    await closeDb();
  });

  // Ids inventados para no chocar con me gusta reales de la base de datos.
  const A = 2_000_000_001;
  const B = 2_000_000_002;
  const call = async (method, url, user) => {
    const res = await app.inject({ method, url, headers: user ? { 'x-test-user': user } : {} });
    return { status: res.statusCode, body: res.json() };
  };

  assert.equal((await call('POST', `/community/collections/${A}/like`)).status, 401);
  assert.equal((await call('POST', '/community/collections/abc/like', ana)).status, 404);

  assert.deepEqual((await call('POST', `/community/collections/${A}/like`, ana)).body, { liked: true, likes: 1 });
  // Repetir no infla el recuento.
  assert.deepEqual((await call('POST', `/community/collections/${A}/like`, ana)).body, { liked: true, likes: 1 });
  assert.deepEqual((await call('POST', `/community/collections/${A}/like`, bea)).body, { liked: true, likes: 2 });
  await call('POST', `/community/collections/${B}/like`, bea);

  // Público: sin sesión, recuentos sin «liked»; con sesión, el de cada uno.
  const anon = await call('GET', `/community/collections/likes?ids=${A},${B},x,${A}`);
  assert.deepEqual(anon.body.likes, {
    [A]: { likes: 2, liked: false },
    [B]: { likes: 1, liked: false },
  });
  const mine = await call('GET', `/community/collections/likes?ids=${A},${B}`, ana);
  assert.equal(mine.body.likes[A].liked, true);
  assert.equal(mine.body.likes[B].liked, false);

  assert.deepEqual((await call('DELETE', `/community/collections/${A}/like`, ana)).body, { liked: false, likes: 1 });
  assert.deepEqual((await call('DELETE', `/community/collections/${A}/like`, ana)).body, { liked: false, likes: 1 });
});
