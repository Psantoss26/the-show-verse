// backend/src/plugins/levelInvalidation.test.js
import assert from 'node:assert/strict';
import test from 'node:test';

import { affectsLevel } from './levelInvalidation.js';

const post = (url) => ({ method: 'POST', url, statusCode: 200 });

test('marcar un visionado puntúa', () => {
  assert.equal(affectsLevel(post('/v1/history')), true);
});

test('añadir y quitar favoritos puntúa', () => {
  assert.equal(affectsLevel(post('/v1/favorites')), true);
  assert.equal(affectsLevel({ method: 'DELETE', url: '/v1/favorites/550/movie', statusCode: 200 }), true);
});

test('puntuar, pendientes, listas e importaciones puntúan', () => {
  assert.equal(affectsLevel(post('/v1/ratings')), true);
  assert.equal(affectsLevel(post('/v1/watchlist')), true);
  assert.equal(affectsLevel(post('/v1/lists')), true);
  assert.equal(affectsLevel(post('/v1/import/trakt')), true);
});

test('las reseñas y los me gusta de la comunidad puntúan', () => {
  assert.equal(affectsLevel(post('/v1/community/movie/550/comments')), true);
  assert.equal(affectsLevel(post('/v1/community/movie/550/comments/abc/like')), true);
  assert.equal(affectsLevel(post('/v1/community/lists/abc/like')), true);
});

test('seguir a alguien y curar el perfil puntúan', () => {
  assert.equal(affectsLevel(post('/v1/users/marta/follow')), true);
  assert.equal(affectsLevel({ method: 'PUT', url: '/v1/users/me/profile-favorites', statusCode: 200 }), true);
});

test('una lectura no invalida nada', () => {
  assert.equal(affectsLevel({ method: 'GET', url: '/v1/favorites', statusCode: 200 }), false);
  assert.equal(affectsLevel({ method: 'HEAD', url: '/v1/history', statusCode: 200 }), false);
});

test('una mutación que falló no invalida nada', () => {
  assert.equal(affectsLevel({ method: 'POST', url: '/v1/favorites', statusCode: 400 }), false);
  assert.equal(affectsLevel({ method: 'POST', url: '/v1/favorites', statusCode: 401 }), false);
  assert.equal(affectsLevel({ method: 'POST', url: '/v1/favorites', statusCode: 500 }), false);
});

test('una mutación en una ruta que no puntúa no invalida nada', () => {
  assert.equal(affectsLevel(post('/v1/auth/login')), false);
  assert.equal(affectsLevel(post('/v1/progress')), false);
  assert.equal(affectsLevel({ method: 'PATCH', url: '/v1/users/preferences', statusCode: 200 }), false);
});

test('la query string no despista al comparador', () => {
  assert.equal(affectsLevel(post('/v1/favorites?dryRun=1')), true);
});

test('una ruta que solo empieza igual no cuela', () => {
  // /v1/historyX no es /v1/history.
  assert.equal(affectsLevel(post('/v1/historyX')), false);
  assert.equal(affectsLevel(post('/v1/listsomething')), false);
});

test('affectsLevel tolera peticiones incompletas', () => {
  assert.equal(affectsLevel({}), false);
  assert.equal(affectsLevel(null), false);
  assert.equal(affectsLevel(undefined), false);
});
