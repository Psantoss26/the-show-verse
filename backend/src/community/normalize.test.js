import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripHtml, normalizeTraktComment, commentRowToApi } from './normalize.js';

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
