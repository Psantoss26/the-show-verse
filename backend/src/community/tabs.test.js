import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCommentTab } from './tabs.js';

test('Populares: por popularidad (likes + respuestas) y, con sort=likes, por me gusta', () => {
  assert.deepEqual(resolveCommentTab('popular'), { tab: 'popular', order: 'popularity', recentWindow: false });
  assert.deepEqual(resolveCommentTab('popular', 'likes'), { tab: 'popular', order: 'likes', recentWindow: false });
});
test('Recientes: por fecha y, con sort=likes, los recientes por me gusta', () => {
  assert.deepEqual(resolveCommentTab('recent'), { tab: 'recent', order: 'recent', recentWindow: false });
  assert.deepEqual(resolveCommentTab('recent', 'likes'), { tab: 'recent', order: 'likes', recentWindow: true });
  assert.deepEqual(resolveCommentTab('newest'), { tab: 'recent', order: 'recent', recentWindow: false });
});
test('los nombres antiguos siguen funcionando', () => {
  assert.deepEqual(resolveCommentTab('top'), { tab: 'popular', order: 'popularity', recentWindow: false });
  assert.deepEqual(resolveCommentTab('likesAll'), { tab: 'popular', order: 'popularity', recentWindow: false });
  assert.deepEqual(resolveCommentTab('top30'), { tab: 'recent', order: 'likes', recentWindow: true });
  assert.deepEqual(resolveCommentTab('likes30'), { tab: 'recent', order: 'likes', recentWindow: true });
});
test('desconocido → Populares', () => {
  assert.deepEqual(resolveCommentTab('nope'), { tab: 'popular', order: 'popularity', recentWindow: false });
});
