import assert from 'node:assert/strict';
import test from 'node:test';

import { isPlausibleRuntime } from './tmdbRuntime.js';

test('isPlausibleRuntime: un anuncio o un tráiler no es la película', () => {
  // Pluto TV: anuncio de 95 s antes de una película de 90 min.
  assert.equal(isPlausibleRuntime(95, 90 * 60), false);
  assert.equal(isPlausibleRuntime(150, 24 * 60), false);
  // La película o el episodio de verdad, con créditos o cortes de más o de menos.
  assert.equal(isPlausibleRuntime(88 * 60, 90 * 60), true);
  assert.equal(isPlausibleRuntime(23 * 60, 24 * 60), true);
  assert.equal(isPlausibleRuntime(50 * 60, 90 * 60), true);
});

test('isPlausibleRuntime: sin referencia fiable no se descarta nada', () => {
  assert.equal(isPlausibleRuntime(95, 0), true);
  assert.equal(isPlausibleRuntime(0, 5400), true);
  // La media de una serie no sirve: hay episodios mucho más cortos.
  assert.equal(isPlausibleRuntime(10 * 60, 45 * 60, { exactReference: false }), true);
});
