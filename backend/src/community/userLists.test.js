import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildUserCommunityRow } from './userLists.js';

const list = { id: 'list-1', name: 'Mis favoritas', description: '' };
const owner = { username: 'pablo', displayName: 'Pablo', avatarUrl: 'https://a/x.png' };

test('la fila de comunidad copia nombre, autor y recuento de la lista de usuario', () => {
  const row = buildUserCommunityRow({
    list,
    owner,
    items: [{ posterPath: '/a.jpg' }, { posterPath: null }, { posterPath: '/b.jpg' }],
  });
  assert.equal(row.source, 'user');
  assert.equal(row.userListId, 'list-1');
  assert.equal(row.externalId, null);
  assert.equal(row.name, 'Mis favoritas');
  assert.equal(row.description, null);
  assert.equal(row.ownerName, 'Pablo');
  assert.equal(row.ownerUsername, 'pablo');
  assert.equal(row.itemCount, 3);
  assert.equal(row.privacy, 'public');
  assert.deepEqual(row.previewPosters, ['https://image.tmdb.org/t/p/w342/a.jpg', 'https://image.tmdb.org/t/p/w342/b.jpg']);
});

test('conserva los «me gusta» al resincronizar y como mucho 5 pósters', () => {
  const items = Array.from({ length: 8 }, (_, i) => ({ posterPath: `/${i}.jpg` }));
  const row = buildUserCommunityRow({ list, owner: { username: 'u' }, items, likes: 12 });
  assert.equal(row.likes, 12);
  assert.equal(row.previewPosters.length, 5);
  assert.equal(row.ownerName, 'u');
});
