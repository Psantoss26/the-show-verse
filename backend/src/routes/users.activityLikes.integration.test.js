import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

// Los me gusta (reseñas, listas de la comunidad y colecciones) en la actividad
// del perfil y en su recuento. Necesita una Postgres con las migraciones
// aplicadas: LISTS_TEST_DATABASE_URL (se salta sin ella). Crea dos usuarios
// temporales y los borra al terminar (en cascada, con sus me gusta).
test('la actividad incluye los me gusta', { skip: !process.env.LISTS_TEST_DATABASE_URL }, async (t) => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.LISTS_TEST_DATABASE_URL;
  process.env.DATABASE_URL_UNPOOLED = process.env.LISTS_TEST_DATABASE_URL;
  // Sin TMDb: la colección queda sin nombre, pero el evento sigue ahí.
  delete process.env.TMDB_API_KEY;
  const { db, closeDb } = await import('../db/client.js');
  const { collectionLikes, commentLikes, communityLists, listLikes, titleComments, users } = await import('../db/schema.js');
  const { eq, inArray } = await import('drizzle-orm');
  const { buildSectionCounts, getUserActivity } = await import('../lib/userProfile.js');

  const [ana, bea] = [randomUUID(), randomUUID()];
  await db.insert(users).values([ana, bea].map((id, index) => ({
    id, username: `test-${id}`, displayName: index ? 'Bea' : 'Ana', email: `${id}@example.test`,
  })));
  const [list] = await db.insert(communityLists)
    .values({ source: 'trakt', name: `Lista ${ana}`, ownerName: 'Trakt user', ownerUsername: 'tk', previewPosters: ['https://image.tmdb.org/t/p/w342/p.jpg'] })
    .returning({ id: communityLists.id });
  t.after(async () => {
    await db.delete(communityLists).where(eq(communityLists.id, list.id));
    await db.delete(users).where(inArray(users.id, [ana, bea]));
    await closeDb();
  });

  // Id inventado para no chocar con datos reales de la base de datos.
  const FILM = 2_000_000_301;
  const [comment] = await db.insert(titleComments).values({
    tmdbId: FILM, mediaType: 'movie', source: 'native', userId: bea, authorName: 'Bea', authorUsername: `test-${bea}`,
    body: 'Imprescindible', createdAt: new Date('2026-01-01T10:00:00Z'),
  }).returning({ id: titleComments.id });

  await db.insert(commentLikes).values({ userId: ana, commentId: comment.id, createdAt: new Date('2026-10-10T10:00:00Z') });
  await db.insert(listLikes).values({ userId: ana, listId: list.id, createdAt: new Date('2026-10-11T10:00:00Z') });
  await db.insert(collectionLikes).values({ userId: ana, collectionId: 2_000_000_302, createdAt: new Date('2026-10-12T10:00:00Z') });

  const page = await getUserActivity(db, ana, { limit: 10 });
  assert.deepEqual(page.items.map((item) => item.type), ['like_collection', 'like_list', 'like_review']);
  const [collection, liked, review] = page.items;
  assert.equal(collection.collectionId, 2_000_000_302);
  assert.deepEqual([liked.listId, liked.name, liked.posterPath], [list.id, `Lista ${ana}`, '/p.jpg']);
  assert.deepEqual([review.tmdbId, review.excerpt, review.reviewAuthor.username], [FILM, 'Imprescindible', `test-${bea}`]);

  // Bea solo escribió la reseña: su actividad no lleva los me gusta de Ana.
  assert.deepEqual((await getUserActivity(db, bea, { limit: 10 })).items.map((item) => item.type), ['review']);

  assert.equal((await buildSectionCounts(db, ana)).activity, 3);
});
