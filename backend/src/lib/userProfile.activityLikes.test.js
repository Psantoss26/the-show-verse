import assert from 'node:assert/strict';
import test from 'node:test';
import { likeExcerpt, mapListLikeEvent, mapReviewLikeEvent, tmdbImagePath } from './userProfile.js';

const at = new Date('2026-10-13T10:00:00Z');

test('me gusta en una reseña: la ficha, su autor y un fragmento sin spoilers', () => {
  const event = mapReviewLikeEvent({
    id: 'l1', commentId: 'c1', tmdbId: 603, mediaType: 'movie', body: 'Una  obra\nmaestra', spoiler: false,
    authorName: 'Ana', authorUsername: 'ana', authorSource: 'native', createdAt: at,
  });
  assert.deepEqual(
    [event.id, event.type, event.tmdbId, event.mediaType, event.excerpt, event.createdAt],
    ['like-review:l1', 'like_review', 603, 'movie', 'Una obra maestra', at],
  );
  assert.deepEqual(event.reviewAuthor, { name: 'Ana', username: 'ana' });

  // De Trakt: el nombre, pero sin enlazar a un perfil de aquí; con spoilers, sin texto.
  const trakt = mapReviewLikeEvent({ id: 'l2', body: 'Muere al final', spoiler: true, authorName: 'tk', authorUsername: 'tk', authorSource: 'trakt' });
  assert.deepEqual(trakt.reviewAuthor, { name: 'tk', username: null });
  assert.equal(trakt.excerpt, null);
  assert.equal(likeExcerpt('x'.repeat(300), false).length, 160);
});

test('me gusta en una lista de la comunidad: nombre, dueño y primer póster', () => {
  const event = mapListLikeEvent({
    id: 'l3', listId: 'cl1', name: 'Terror', ownerName: 'Bea', ownerUsername: 'bea', listSource: 'user',
    previewPosters: ['nope', 'https://image.tmdb.org/t/p/w342/a.jpg'], createdAt: at,
  });
  assert.deepEqual(
    [event.id, event.type, event.listId, event.name, event.posterPath],
    ['like-list:l3', 'like_list', 'cl1', 'Terror', '/a.jpg'],
  );
  assert.deepEqual(event.listOwner, { name: 'Bea', username: 'bea' });
  assert.deepEqual(mapListLikeEvent({ id: 'l4', listSource: 'trakt', ownerUsername: 'x', previewPosters: null }).listOwner, { name: 'x', username: null });
  assert.equal(tmdbImagePath('https://image.tmdb.org/t/p/original/b.png'), '/b.png');
});
