import assert from 'node:assert/strict';
import test from 'node:test';

import { ANDROID, BROWSER, detectionOriginFromProviderUid } from './detectionOrigin.js';

test('el token del móvil es una detección de Android', () => {
  assert.equal(detectionOriginFromProviderUid('mobile:user-1:device-1'), ANDROID);
});

test('el token de la extensión es una detección del navegador', () => {
  assert.equal(detectionOriginFromProviderUid('browser:user-1:legacy'), BROWSER);
});

test('un token sin prefijo conocido no tiene origen', () => {
  assert.equal(detectionOriginFromProviderUid('user-1'), null);
  assert.equal(detectionOriginFromProviderUid(null), null);
  assert.equal(detectionOriginFromProviderUid(''), null);
});
