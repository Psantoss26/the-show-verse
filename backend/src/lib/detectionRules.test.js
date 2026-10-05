import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GLOBAL_OWNER,
  aggregateGlobalRules,
  decideFromRules,
  userRulesFromCorrection,
} from './detectionRules.js';

const ME = 'user-me';
const override = (owner, tmdbId, mediaType = 'tv', supporters = 1) => ({
  owner, rule: 'override', tmdbId, mediaType, title: `T${tmdbId}`, posterPath: null, supporters,
});
const reject = (owner, tmdbId, mediaType = 'tv', supporters = 1) => ({ owner, rule: 'reject', tmdbId, mediaType, supporters });
const notATitle = (owner, supporters = 1) => ({ owner, rule: 'not_a_title', supporters });

test('sin reglas no hay decisión ni vetos', () => {
  assert.deepEqual(decideFromRules([], ME, 3), { decision: null, rejects: [] });
});

test('la regla personal manda sobre la global', () => {
  const { decision } = decideFromRules([override(GLOBAL_OWNER, 1, 'tv', 5), override(ME, 2)], ME, 3);
  assert.equal(decision.scope, 'user');
  assert.equal(decision.tmdbId, 2);
});

test('una regla global sin respaldo suficiente no aplica', () => {
  assert.equal(decideFromRules([notATitle(GLOBAL_OWNER, 2)], ME, 3).decision, null);
  assert.equal(decideFromRules([notATitle(GLOBAL_OWNER, 3)], ME, 3).decision.rule, 'not_a_title');
});

test('no se impone por consenso un título que el usuario ya rechazó', () => {
  const { decision, rejects } = decideFromRules([override(GLOBAL_OWNER, 7, 'tv', 4), reject(ME, 7)], ME, 3);
  assert.equal(decision, null);
  assert.deepEqual(rejects, [{ tmdbId: 7, mediaType: 'tv' }]);
});

test('el título elegido por el usuario no queda vetado por un veto global', () => {
  const { decision, rejects } = decideFromRules([override(ME, 9), reject(GLOBAL_OWNER, 9, 'tv', 3), reject(GLOBAL_OWNER, 4, 'tv', 3)], ME, 3);
  assert.equal(decision.tmdbId, 9);
  assert.deepEqual(rejects, [{ tmdbId: 4, mediaType: 'tv' }]);
});

test('las reglas de otros usuarios no se aplican', () => {
  assert.deepEqual(decideFromRules([override('otro', 1), reject('otro', 2)], ME, 3), { decision: null, rejects: [] });
});

test('una corrección sin título elegido solo veta el propuesto', () => {
  assert.deepEqual(
    userRulesFromCorrection({ verdict: 'wrong_title', rejectedTmdbId: 5, rejectedMediaType: 'movie' }),
    { decision: null, reject: { tmdbId: 5, mediaType: 'movie' } },
  );
});

const correction = (userId, extra, createdAt = '2026-10-01T00:00:00Z') => ({
  userId, rejectedTmdbId: 100, rejectedMediaType: 'tv', createdAt, ...extra,
});

test('el consenso exige el mínimo de usuarios distintos', () => {
  const two = [
    correction('a', { verdict: 'wrong_title', tmdbId: 1, mediaType: 'tv' }),
    correction('b', { verdict: 'wrong_title', tmdbId: 1, mediaType: 'tv' }),
  ];
  assert.equal(aggregateGlobalRules(two, 3).decision, null);
  const three = [...two, correction('c', { verdict: 'wrong_title', tmdbId: 1, mediaType: 'tv' })];
  const result = aggregateGlobalRules(three, 3);
  assert.equal(result.decision.tmdbId, 1);
  assert.equal(result.decision.supporters, 3);
  assert.deepEqual(result.rejects, [{ tmdbId: 100, mediaType: 'tv', supporters: 3 }]);
});

test('un mismo usuario cuenta una vez, con su corrección más reciente', () => {
  const rows = [
    correction('a', { verdict: 'wrong_title', tmdbId: 1, mediaType: 'tv' }, '2026-10-01T00:00:00Z'),
    correction('a', { verdict: 'not_a_title' }, '2026-10-02T00:00:00Z'),
    correction('b', { verdict: 'not_a_title' }),
  ];
  const result = aggregateGlobalRules(rows, 2);
  assert.equal(result.decision.rule, 'not_a_title');
  assert.equal(result.decision.supporters, 2);
});

test('un empate en cabeza no decide nada', () => {
  const rows = [
    correction('a', { verdict: 'wrong_title', tmdbId: 1, mediaType: 'tv' }),
    correction('b', { verdict: 'not_a_title' }),
  ];
  assert.equal(aggregateGlobalRules(rows, 1).decision, null);
});
