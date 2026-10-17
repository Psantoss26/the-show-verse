import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_ACTOR_IDS, parsePersonId, parsePersonIds } from './actorLikes.js';

test('parsePersonId valida identificadores enteros de persona', () => {
  assert.equal(parsePersonId(1), 1);
  assert.equal(parsePersonId('287'), 287);
  assert.equal(parsePersonId('0'), null);
  assert.equal(parsePersonId('-5'), null);
  assert.equal(parsePersonId('abc'), null);
  assert.equal(parsePersonId(null), null);
  assert.equal(parsePersonId(undefined), null);
  assert.equal(parsePersonId(2_147_483_648), null);
});

test('parsePersonIds desglosa listas separadas por coma sin repetidos', () => {
  assert.deepEqual(parsePersonIds('1,2,3'), [1, 2, 3]);
  assert.deepEqual(parsePersonIds('1, 1, 2 , x, 3'), [1, 2, 3]);
  assert.deepEqual(parsePersonIds(''), []);
  assert.deepEqual(parsePersonIds(null), []);

  const muchos = Array.from({ length: MAX_ACTOR_IDS + 50 }, (_, i) => i + 1).join(',');
  const parsed = parsePersonIds(muchos);
  assert.equal(parsed.length, MAX_ACTOR_IDS);
});
