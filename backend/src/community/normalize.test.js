import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripHtml, normalizeTraktComment, commentRowToApi, normalizeTraktList, listRowToApi, posterUrl } from './normalize.js';

test('stripHtml removes tags and decodes basic entities', () => {
  assert.equal(stripHtml('<b>Great</b> &amp; fun'), 'Great & fun');
});

test('normalizeTraktComment maps Trakt fields to a row', () => {
  const raw = {
    id: 42, comment: 'Loved it', likes: 12, spoiler: false, created_at: '2019-01-26T16:50:00.000Z',
    user: { name: 'Dearbhla', username: 'dear', vip: true, images: { avatar: { full: 'http://a/x.png' } } },
  };
  const row = normalizeTraktComment(raw, { tmdbId: 155, mediaType: 'movie' });
  assert.equal(row.source, 'trakt');
  assert.equal(row.externalId, 42);
  assert.equal(row.tmdbId, 155);
  assert.equal(row.mediaType, 'movie');
  assert.equal(row.authorName, 'Dearbhla');
  assert.equal(row.authorUsername, 'dear');
  assert.equal(row.authorAvatarUrl, 'http://a/x.png');
  assert.equal(row.authorIsVip, true);
  assert.equal(row.body, 'Loved it');
  assert.equal(row.likes, 12);
  assert.equal(row.spoiler, false);
  assert.deepEqual(row.createdAt, new Date('2019-01-26T16:50:00.000Z'));
});

test('normalizeTraktComment returns null when body empty', () => {
  assert.equal(normalizeTraktComment({ id: 1, comment: '   ' }, { tmdbId: 1, mediaType: 'tv' }), null);
});

test('commentRowToApi produces the UI contract shape', () => {
  const api = commentRowToApi({
    id: 'uuid-1', body: 'Nice', likes: 3, spoiler: true,
    createdAt: new Date('2020-05-01T00:00:00Z'),
    authorName: 'Ben', authorUsername: 'ben', authorAvatarUrl: 'http://a/b.png', authorIsVip: false,
  });
  assert.equal(api.id, 'uuid-1');
  assert.equal(api.comment, 'Nice');
  assert.equal(api.likes, 3);
  assert.equal(api.spoiler, true);
  assert.equal(api.user.name, 'Ben');
  assert.equal(api.user.username, 'ben');
  assert.equal(api.user.vip, false);
  assert.equal(api.user.images.avatar.full, 'http://a/b.png');
  assert.equal(api.created_at, '2020-05-01T00:00:00.000Z');
});

test('commentRowToApi marks a comment the viewer has already liked', () => {
  const row = { id: 'uuid-1', body: 'Nice', likes: 3, createdAt: new Date('2020-05-01T00:00:00Z') };
  assert.equal(commentRowToApi({ ...row, likedByViewer: true }).liked, true);
});

test('commentRowToApi reports not-liked when the viewer is anonymous', () => {
  const row = { id: 'uuid-1', body: 'Nice', likes: 3, createdAt: new Date('2020-05-01T00:00:00Z') };
  assert.equal(commentRowToApi(row).liked, false);
});

test('listRowToApi marks a list the viewer has already liked', () => {
  const row = { id: 'L1', name: 'Cult Classics', itemCount: 3, likes: 43 };
  assert.equal(listRowToApi({ ...row, likedByViewer: true }).liked, true);
  assert.equal(listRowToApi(row).liked, false);
});

test('normalizeTraktList maps a Trakt "list containing" row', () => {
  const raw = {
    name: 'Cult Classics', description: 'Weird & wonderful', item_count: 693, likes: 43,
    privacy: 'public', ids: { trakt: 99, slug: 'cult-classics' },
    user: { username: 'madmapper', name: 'MadMapper', images: { avatar: { full: 'http://a/m.png' } } },
  };
  const row = normalizeTraktList(raw);
  assert.equal(row.source, 'trakt');
  assert.equal(row.externalId, 99);
  assert.equal(row.slug, 'cult-classics');
  assert.equal(row.name, 'Cult Classics');
  assert.equal(row.itemCount, 693);
  assert.equal(row.likes, 43);
  assert.equal(row.ownerUsername, 'madmapper');
  assert.equal(row.ownerAvatarUrl, 'http://a/m.png');
});

test('posterUrl builds a full TMDB url or null', () => {
  assert.equal(posterUrl('/abc.jpg'), 'https://image.tmdb.org/t/p/w342/abc.jpg');
  assert.equal(posterUrl(null), null);
});

test('listRowToApi produces the Surface B contract', () => {
  const api = listRowToApi({
    id: 'L1', externalId: 99, slug: 'cult-classics', name: 'Cult Classics', description: 'x',
    itemCount: 693, likes: 43, ownerUsername: 'madmapper', ownerName: 'MadMapper',
    ownerAvatarUrl: 'http://a/m.png', previewPosters: ['https://image.tmdb.org/t/p/w342/a.jpg'],
  });
  assert.equal(api.list.name, 'Cult Classics');
  assert.equal(api.list.item_count, 693);
  assert.equal(api.list.likes, 43);
  assert.equal(api.list.ids.slug, 'cult-classics');
  assert.equal(api.list.ids.trakt, 99);
  assert.equal(api.user.username, 'madmapper');
  assert.equal(api.user.images.avatar.full, 'http://a/m.png');
  assert.deepEqual(api.previewPosters, ['https://image.tmdb.org/t/p/w342/a.jpg']);
});
