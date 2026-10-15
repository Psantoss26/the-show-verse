import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

// Me gusta en listas de la comunidad: idempotentes, públicos y por visitante,
// como los de las colecciones. Lo que se rompía: la ficha de la lista no
// devolvía `liked` dentro de `list` (donde la lee el cliente), así que al
// recargar el corazón salía vacío aunque el me gusta estuviera guardado.
// Necesita una Postgres con las migraciones aplicadas: LISTS_TEST_DATABASE_URL
// (se salta sin ella). Crea dos usuarios y una lista temporales y los borra al
// terminar (en cascada, con sus me gusta).
test('me gusta en listas de la comunidad', { skip: !process.env.LISTS_TEST_DATABASE_URL }, async (t) => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.LISTS_TEST_DATABASE_URL;
  process.env.DATABASE_URL_UNPOOLED = process.env.LISTS_TEST_DATABASE_URL;
  const { default: Fastify } = await import('fastify');
  const { db, closeDb } = await import('../db/client.js');
  const { users, communityLists } = await import('../db/schema.js');
  const { eq, inArray } = await import('drizzle-orm');
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
  const [list] = await db.insert(communityLists)
    .values({ source: 'trakt', name: 'Prueba de me gusta' })
    .returning({ id: communityLists.id });
  t.after(async () => {
    await db.delete(communityLists).where(eq(communityLists.id, list.id));
    await db.delete(users).where(inArray(users.id, [ana, bea]));
    await app.close();
    await closeDb();
  });

  const call = async (method, url, user) => {
    const res = await app.inject({ method, url, headers: user ? { 'x-test-user': user } : {} });
    return { status: res.statusCode, body: res.json() };
  };
  const detail = (user) => call('GET', `/community/lists/${list.id}?limit=1`, user);

  assert.equal((await call('POST', `/community/lists/${list.id}/like`)).status, 401);
  assert.equal((await call('POST', '/community/lists/abc/like', ana)).status, 404);
  assert.equal((await call('POST', `/community/lists/${randomUUID()}/like`, ana)).status, 404);

  assert.deepEqual((await call('POST', `/community/lists/${list.id}/like`, ana)).body, { liked: true, likes: 1 });
  // Repetir no infla el recuento.
  assert.deepEqual((await call('POST', `/community/lists/${list.id}/like`, ana)).body, { liked: true, likes: 1 });

  // La ficha: con sesión, el `liked` de cada uno DENTRO de `list`; sin sesión, falso.
  const mine = await detail(ana);
  assert.equal(mine.status, 200);
  assert.equal(mine.body.list.liked, true);
  assert.equal(mine.body.list.likes, 1);
  assert.equal((await detail(bea)).body.list.liked, false);
  assert.equal((await detail()).body.list.liked, false);

  assert.deepEqual((await call('POST', `/community/lists/${list.id}/like`, bea)).body, { liked: true, likes: 2 });
  assert.deepEqual((await call('DELETE', `/community/lists/${list.id}/like`, ana)).body, { liked: false, likes: 1 });
  assert.deepEqual((await call('DELETE', `/community/lists/${list.id}/like`, ana)).body, { liked: false, likes: 1 });
  assert.equal((await detail(ana)).body.list.liked, false);
  assert.equal((await detail(bea)).body.list.liked, true);
});
