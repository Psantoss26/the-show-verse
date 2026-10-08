import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

// Publicar una lista de usuario en «Listas de la comunidad» y mantenerla
// sincronizada. Necesita una Postgres: LISTS_TEST_DATABASE_URL (como los demás
// tests de integración, se salta sin ella). Crea un usuario temporal y lo borra
// al terminar (en cascada: sus listas y la copia de la comunidad).
test('listas de usuario en la comunidad: publicar, sincronizar y retirar', {
  skip: !process.env.LISTS_TEST_DATABASE_URL,
}, async (t) => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.LISTS_TEST_DATABASE_URL;
  process.env.DATABASE_URL_UNPOOLED = process.env.LISTS_TEST_DATABASE_URL;
  const { default: Fastify } = await import('fastify');
  const { db, closeDb } = await import('../db/client.js');
  const { users, communityLists, communityListItems } = await import('../db/schema.js');
  const { eq } = await import('drizzle-orm');
  const { default: listsRoutes } = await import('./lists.js');

  const app = Fastify();
  app.decorate('requireAuth', async (req, reply) => {
    if (!req.headers['x-test-user']) return reply.code(401).send({ error: 'unauthorized' });
    req.user = { id: req.headers['x-test-user'] };
  });
  await app.register(listsRoutes, { prefix: '/lists' });

  const uid = randomUUID();
  await db.insert(users).values({ id: uid, username: `test-${uid}`, displayName: 'Prueba', email: `${uid}@example.test` });
  t.after(async () => {
    await db.delete(users).where(eq(users.id, uid));
    await app.close();
    await closeDb();
  });

  const call = async (method, url, payload) => {
    const res = await app.inject({ method, url, payload, headers: { 'x-test-user': uid } });
    assert.ok(res.statusCode < 300, `${method} ${url} → ${res.statusCode} ${res.body}`);
    return res.json();
  };
  const communityRow = async (listId) => {
    const [row] = await db.select().from(communityLists).where(eq(communityLists.userListId, listId));
    return row || null;
  };

  const { list } = await call('POST', '/lists', { name: 'Mis favoritas', description: 'Para la comunidad' });
  await call('POST', `/lists/${list.id}/items`, { tmdbId: 603, mediaType: 'movie', title: 'The Matrix', posterPath: '/m.jpg' });
  await call('POST', `/lists/${list.id}/items`, { tmdbId: 1399, mediaType: 'tv', title: 'Game of Thrones', posterPath: '/g.jpg' });

  await t.test('sin publicar no está en la comunidad', async () => {
    assert.equal(await communityRow(list.id), null);
    assert.equal((await call('GET', `/lists/${list.id}`)).inCommunity, false);
  });

  await t.test('publicar copia la lista, su autor y sus títulos', async () => {
    const res = await call('PATCH', `/lists/${list.id}`, { inCommunity: true });
    assert.equal(res.inCommunity, true);
    const row = await communityRow(list.id);
    assert.equal(row.source, 'user');
    assert.equal(row.name, 'Mis favoritas');
    assert.equal(row.ownerUsername, `test-${uid}`);
    assert.equal(row.itemCount, 2);
    const items = await db.select().from(communityListItems).where(eq(communityListItems.listId, row.id));
    assert.deepEqual(items.map((i) => i.tmdbId).sort((a, b) => a - b), [603, 1399]);
    assert.equal((await call('GET', `/lists/${list.id}`)).inCommunity, true);
    // Y aparece en la primera página de «Listas de la comunidad», delante de
    // las importadas de Trakt aunque sea más corta.
    const { discoverLists } = await import('../community/store.js');
    const discovered = await discoverLists({ sort: 'items_desc', limit: 30 });
    assert.ok(discovered.some((entry) => entry.list.id === row.id));
  });

  await t.test('editar la lista resincroniza la copia (y conserva los me gusta)', async () => {
    const before = await communityRow(list.id);
    await db.update(communityLists).set({ likes: 7 }).where(eq(communityLists.id, before.id));
    await call('PATCH', `/lists/${list.id}`, { name: 'Renombrada' });
    await call('DELETE', `/lists/${list.id}/items/603/movie`);
    const row = await communityRow(list.id);
    assert.equal(row.id, before.id);
    assert.equal(row.name, 'Renombrada');
    assert.equal(row.itemCount, 1);
    assert.equal(row.likes, 7);
  });

  await t.test('hacerla privada la retira de la comunidad', async () => {
    const res = await call('PATCH', `/lists/${list.id}`, { isPublic: false });
    assert.equal(res.inCommunity, false);
    assert.equal(await communityRow(list.id), null);
    // Y una privada no se puede publicar.
    assert.equal((await call('PATCH', `/lists/${list.id}`, { inCommunity: true })).inCommunity, false);
  });

  await t.test('retirar a mano y borrar la lista', async () => {
    await call('PATCH', `/lists/${list.id}`, { isPublic: true, inCommunity: true });
    assert.ok(await communityRow(list.id));
    await call('PATCH', `/lists/${list.id}`, { inCommunity: false });
    assert.equal(await communityRow(list.id), null);
    await call('PATCH', `/lists/${list.id}`, { inCommunity: true });
    await call('DELETE', `/lists/${list.id}`);
    assert.equal(await communityRow(list.id), null);
  });
});
