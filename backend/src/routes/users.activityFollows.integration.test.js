import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

// Los seguimientos en la actividad del perfil, el feed de Siguiendo, Hoy y las
// alertas del seguido. Necesita una Postgres con las migraciones aplicadas:
// LISTS_TEST_DATABASE_URL (se salta sin ella). Crea tres usuarios temporales y
// los borra al terminar (en cascada, con sus seguimientos).
test('los seguimientos llegan a la actividad, a Hoy y a las alertas', { skip: !process.env.LISTS_TEST_DATABASE_URL }, async (t) => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.LISTS_TEST_DATABASE_URL;
  process.env.DATABASE_URL_UNPOOLED = process.env.LISTS_TEST_DATABASE_URL;
  delete process.env.TMDB_API_KEY;
  const { db, closeDb } = await import('../db/client.js');
  const { follows, users } = await import('../db/schema.js');
  const { inArray } = await import('drizzle-orm');
  const { buildSectionCounts, getFollowingActivity, getUserActivity } = await import('../lib/userProfile.js');
  const { getUserNotifications } = await import('../lib/notifications.js');
  const { getTodayActivity } = await import('../lib/todayActivity.js');

  const [ana, bea, carla] = [randomUUID(), randomUUID(), randomUUID()];
  const names = { [ana]: 'Ana', [bea]: 'Bea', [carla]: 'Carla' };
  await db.insert(users).values([ana, bea, carla].map((id) => ({
    id, username: `test-${id}`, displayName: names[id], email: `${id}@example.test`,
  })));
  t.after(async () => {
    await db.delete(users).where(inArray(users.id, [ana, bea, carla]));
    await closeDb();
  });

  const now = Date.now();
  // Ana sigue a Bea; Carla sigue a Bea; Ana sigue a Carla.
  await db.insert(follows).values([
    { followerId: ana, followingId: bea, createdAt: new Date(now - 3 * 60_000) },
    { followerId: carla, followingId: bea, createdAt: new Date(now - 2 * 60_000) },
    { followerId: ana, followingId: carla, createdAt: new Date(now - 60_000) },
  ]);

  const anaPage = await getUserActivity(db, ana, { limit: 10 });
  assert.deepEqual(anaPage.items.map((item) => [item.type, item.targetUser.displayName]), [
    ['follow', 'Carla'],
    ['follow', 'Bea'],
  ]);
  const beaPage = await getUserActivity(db, bea, { limit: 10 });
  assert.deepEqual(beaPage.items.map((item) => [item.type, item.targetUser.displayName]), [
    ['follower', 'Carla'],
    ['follower', 'Ana'],
  ]);
  assert.equal((await buildSectionCounts(db, bea)).activity, 2);

  // Ana sigue a Bea y a Carla: «Carla ha empezado a seguir a Bea» sale una vez
  // (desde Carla), y «Bea tiene un nuevo seguidor: Ana» no sale (es quien mira).
  const feed = await getFollowingActivity(db, ana, { limit: 20 });
  assert.deepEqual(feed.items.map((item) => [item.author.displayName, item.type, item.targetUser.displayName]), [
    ['Carla', 'follow', 'Bea'],
  ]);

  // Alertas: Bea tiene dos seguidores nuevos; Ana ninguno.
  const beaAlerts = await getUserNotifications(db, bea);
  assert.deepEqual(
    beaAlerts.events.filter((e) => e.type === 'new_follower').map((e) => e.follower.displayName),
    ['Carla', 'Ana'],
  );
  const anaAlerts = await getUserNotifications(db, ana);
  assert.equal(anaAlerts.events.filter((e) => e.type === 'new_follower').length, 0);

  // Hoy · Siguiendo de Ana: los seguimientos de Bea y Carla de hoy.
  const today = await getTodayActivity(db, { id: ana, timezone: 'Europe/Madrid' }, { scope: 'following', day: 'week' });
  assert.deepEqual(today.follows.map((f) => [f.user.displayName, f.target.displayName]), [['Carla', 'Bea']]);
  // Comunidad: todos.
  const community = await getTodayActivity(db, { id: bea, timezone: 'Europe/Madrid' }, { scope: 'community', day: 'week' });
  const pairs = community.follows
    .filter((f) => [ana, bea, carla].includes(f.user.id))
    .map((f) => [f.user.displayName, f.target.displayName]);
  assert.deepEqual(pairs, [['Ana', 'Carla'], ['Carla', 'Bea'], ['Ana', 'Bea']]);
});
