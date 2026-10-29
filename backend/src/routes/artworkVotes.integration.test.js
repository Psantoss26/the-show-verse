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

  // Colecciones («Editar colección»): mismo endpoint que los títulos.
  const COLLECTION = 2_000_000_301;
  await app.inject({
    method: 'PATCH',
    url: '/users/preferences',
    headers: { 'x-test-user': ana },
    payload: { artworkChanges: [{ type: 'collection', id: COLLECTION, kind: 'background', filePath: '/portada.jpg' }] },
  });
  const collectionArtwork = await app.inject({ method: 'GET', url: `/community/collection/${COLLECTION}/artwork` });
  assert.deepEqual(collectionArtwork.json().artwork, { background: '/portada.jpg' });
  await app.inject({
    method: 'PATCH',
    url: '/users/preferences',
    headers: { 'x-test-user': ana },
    payload: { artworkChanges: [{ type: 'collection', id: COLLECTION, kind: 'background', filePath: null }] },
  });

  // Temporadas («Editar portada»): mismo voto, consultado en lote por id.
  const SEASON_A = 2_000_000_201;
  const SEASON_B = 2_000_000_202;
  const selectSeason = (user, id, filePath) => app.inject({
    method: 'PATCH',
    url: '/users/preferences',
    headers: { 'x-test-user': user },
    payload: { artworkChanges: [{ type: 'season', id, kind: 'poster', filePath }] },
  });
  const seasonPosters = async () => {
    const res = await app.inject({ method: 'GET', url: `/community/seasons/artwork?ids=${SEASON_A},${SEASON_B}` });
    assert.equal(res.statusCode, 200);
    return res.json().posters;
  };
  assert.deepEqual(await seasonPosters(), {});
  await selectSeason(ana, SEASON_A, '/s1.jpg');
  await selectSeason(bea, SEASON_A, '/s2.jpg');
  await selectSeason(carla, SEASON_A, '/s2.jpg');
  await selectSeason(ana, SEASON_B, '/s3.jpg');
  assert.deepEqual(await seasonPosters(), { [SEASON_A]: '/s2.jpg', [SEASON_B]: '/s3.jpg' });
  for (const user of [ana, bea, carla]) await selectSeason(user, SEASON_A, null);
  await selectSeason(ana, SEASON_B, null);
  assert.deepEqual(await seasonPosters(), {});

  // Tarjetas de páginas y dashboards: la más votada de VARIOS títulos en lote,
  // filtrable por tipo de imagen.
  const TITLE_A = 2_000_000_401;
  const TITLE_B = 2_000_000_402;
  const selectTitle = (user, id, kind, filePath) => app.inject({
    method: 'PATCH',
    url: '/users/preferences',
    headers: { 'x-test-user': user },
    payload: { artworkChanges: [{ type: 'movie', id, kind, filePath }] },
  });
  const titlesArtwork = async (query) => {
    const res = await app.inject({ method: 'GET', url: `/community/artwork?type=movie&ids=${TITLE_A},${TITLE_B}${query || ''}` });
    assert.equal(res.statusCode, 200);
    return res.json().artwork;
  };
  assert.deepEqual(await titlesArtwork(), {});
  await selectTitle(ana, TITLE_A, 'poster', '/p1.jpg');
  await selectTitle(bea, TITLE_A, 'poster', '/p2.jpg');
  await selectTitle(carla, TITLE_A, 'poster', '/p2.jpg');
  await selectTitle(ana, TITLE_B, 'cardBackdrop', '/b1.jpg');
  await selectTitle(ana, TITLE_B, 'logo', '/l1.png');
  assert.deepEqual(await titlesArtwork(), {
    [TITLE_A]: { poster: '/p2.jpg' },
    [TITLE_B]: { cardBackdrop: '/b1.jpg', logo: '/l1.png' },
  });
  assert.deepEqual(await titlesArtwork('&kinds=poster,cardBackdrop'), {
    [TITLE_A]: { poster: '/p2.jpg' },
    [TITLE_B]: { cardBackdrop: '/b1.jpg' },
  });
  assert.equal((await app.inject({ method: 'GET', url: '/community/artwork?type=nope&ids=1' })).statusCode, 400);
  for (const user of [ana, bea, carla]) await selectTitle(user, TITLE_A, 'poster', null);
  await selectTitle(ana, TITLE_B, 'cardBackdrop', null);
  await selectTitle(ana, TITLE_B, 'logo', null);
  assert.deepEqual(await titlesArtwork(), {});
});
