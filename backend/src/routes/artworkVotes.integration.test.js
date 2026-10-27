import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

// Votos de «Portadas y fondos»: cada selección guardada es un voto y la más
// votada sale en /community/:type/:id/artwork (y en el resumen de la ficha).
// Necesita una Postgres con las migraciones aplicadas: LISTS_TEST_DATABASE_URL
// (se salta sin ella). Crea usuarios temporales y los borra al terminar (en
// cascada, con sus votos).
test('votos de artwork', { skip: !process.env.LISTS_TEST_DATABASE_URL }, async (t) => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.LISTS_TEST_DATABASE_URL;
  process.env.DATABASE_URL_UNPOOLED = process.env.LISTS_TEST_DATABASE_URL;
  const { default: Fastify } = await import('fastify');
  const { db, closeDb } = await import('../db/client.js');
  const { users } = await import('../db/schema.js');
  const { inArray } = await import('drizzle-orm');
  const { default: usersRoutes } = await import('./users.js');
  const { default: communityRoutes } = await import('./community.js');

  const app = Fastify();
  app.addHook('onRequest', async (req) => {
    const id = req.headers['x-test-user'];
    if (id) req.user = { id };
  });
  app.decorate('requireAuth', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
  });
  await app.register(usersRoutes, { prefix: '/users' });
  await app.register(communityRoutes, { prefix: '/community' });

  const [ana, bea, carla] = [randomUUID(), randomUUID(), randomUUID()];
  await db.insert(users).values([ana, bea, carla].map((id) => ({
    id, username: `test-${id}`, displayName: 'Prueba', email: `${id}@example.test`,
  })));
  t.after(async () => {
    await db.delete(users).where(inArray(users.id, [ana, bea, carla]));
    await app.close();
    await closeDb();
  });

  // Id inventado para no chocar con votos reales de la base de datos.
  const ID = 2_000_000_101;
  const select = (user, kind, filePath) => app.inject({
    method: 'PATCH',
    url: '/users/preferences',
    headers: { 'x-test-user': user },
    payload: { artworkChanges: [{ type: 'movie', id: ID, kind, filePath }] },
  });
  const artwork = async () => {
    const res = await app.inject({ method: 'GET', url: `/community/movie/${ID}/artwork` });
    assert.equal(res.statusCode, 200);
    return res.json().artwork;
  };

  assert.deepEqual(await artwork(), {});

  // Una sola selección ya es la imagen por defecto de su tipo.
  assert.equal((await select(ana, 'mobilePoster', '/a.jpg')).statusCode, 200);
  assert.deepEqual(await artwork(), { mobilePoster: '/a.jpg' });

  // Dos votos ganan a uno.
  await select(bea, 'mobilePoster', '/b.jpg');
  await select(carla, 'mobilePoster', '/b.jpg');
  assert.equal((await artwork()).mobilePoster, '/b.jpg');

  // Un usuario = un voto: cambiar de imagen mueve el voto, no lo suma.
  await select(carla, 'mobilePoster', '/a.jpg');
  await select(carla, 'mobilePoster', '/a.jpg');
  assert.equal((await artwork()).mobilePoster, '/a.jpg');

  // Restablecer retira el voto.
  await select(ana, 'mobilePoster', null);
  await select(carla, 'mobilePoster', null);
  assert.equal((await artwork()).mobilePoster, '/b.jpg');
  await select(bea, 'mobilePoster', null);
  assert.deepEqual(await artwork(), {});
});
