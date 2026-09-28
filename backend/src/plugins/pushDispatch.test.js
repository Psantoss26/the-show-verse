import assert from 'node:assert/strict';
import test from 'node:test';
import { pushUserFor } from './pushDispatch.js';

test('push: vistos manuales y progreso con sesión', () => {
  assert.equal(pushUserFor({ method: 'POST', url: '/v1/history/episodes', statusCode: 200, userId: 'u' }), 'u');
  assert.equal(pushUserFor({ method: 'POST', url: '/v1/progress?x=1', statusCode: 201, userId: 'u' }), 'u');
});

test('push: sincronización con token del dispositivo', () => {
  assert.equal(pushUserFor({ method: 'POST', url: '/v1/auth/netflix/progress', statusCode: 200, pushUserId: 'd' }), 'd');
});

test('push: lo demás no avisa', () => {
  assert.equal(pushUserFor({ method: 'DELETE', url: '/v1/history/1', statusCode: 200, userId: 'u' }), null);
  assert.equal(pushUserFor({ method: 'POST', url: '/v1/history', statusCode: 400, userId: 'u' }), null);
  assert.equal(pushUserFor({ method: 'POST', url: '/v1/historyX', statusCode: 200, userId: 'u' }), null);
  assert.equal(pushUserFor({ method: 'POST', url: '/v1/ratings', statusCode: 200, userId: 'u' }), null);
  assert.equal(pushUserFor({ method: 'POST', url: '/v1/history', statusCode: 200 }), null);
});
