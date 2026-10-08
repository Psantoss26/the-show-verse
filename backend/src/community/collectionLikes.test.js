import assert from 'node:assert/strict';
import test from 'node:test';

import { MAX_COLLECTION_IDS, parseCollectionId, parseCollectionIds } from './collectionLikes.js';

test('parseCollectionId acepta solo enteros positivos', () => {
  assert.equal(parseCollectionId('10'), 10);
  assert.equal(parseCollectionId(87359), 87359);
  for (const bad of ['0', '-3', '1.5', 'abc', '', null, undefined, '9999999999']) {
    assert.equal(parseCollectionId(bad), null, String(bad));
  }
});

test('parseCollectionIds limpia, quita repetidos y limita', () => {
  assert.deepEqual(parseCollectionIds('10, 1241,x,10,,-1'), [10, 1241]);
  assert.deepEqual(parseCollectionIds(undefined), []);
  const many = Array.from({ length: MAX_COLLECTION_IDS + 50 }, (_, i) => i + 1).join(',');
  assert.equal(parseCollectionIds(many).length, MAX_COLLECTION_IDS);
});
