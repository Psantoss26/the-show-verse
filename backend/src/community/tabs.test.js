import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCommentTab } from './tabs.js';

test('top → likes, no window', () => {
  assert.deepEqual(resolveCommentTab('top'), { order: 'likes', sinceDays: null });
  assert.deepEqual(resolveCommentTab('likesAll'), { order: 'likes', sinceDays: null });
});
test('top30 → likes, 30-day window', () => {
  assert.deepEqual(resolveCommentTab('top30'), { order: 'likes', sinceDays: 30 });
  assert.deepEqual(resolveCommentTab('likes30'), { order: 'likes', sinceDays: 30 });
});
test('recent → recent, no window', () => {
  assert.deepEqual(resolveCommentTab('recent'), { order: 'recent', sinceDays: null });
});
test('unknown → default top', () => {
  assert.deepEqual(resolveCommentTab('nope'), { order: 'likes', sinceDays: null });
});
