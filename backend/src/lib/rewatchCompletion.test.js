// backend/src/lib/rewatchCompletion.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldRecordCompletion,
  REWATCH_COMPLETION_COOLDOWN_MS,
} from './rewatchCompletion.js';

test('cruce del 90% desde una sesión en curso → registra play', () => {
  // Fila de watch_progress presente (<90%) que ahora cruza el umbral.
  assert.equal(
    shouldRecordCompletion({ wasInProgress: true, hasRecentPlay: false }),
    true,
  );
});

test('cruce del 90% aunque exista un play reciente → registra play (rewatch)', () => {
  // Re-reproducción del mismo episodio empezando de bajo: hubo fila en curso, y
  // aunque el primer visionado sea reciente, es un rewatch legítimo.
  assert.equal(
    shouldRecordCompletion({ wasInProgress: true, hasRecentPlay: true }),
    true,
  );
});

test('ping de cola tras completar (sin fila, con play reciente) → NO duplica', () => {
  // 98% tras haber cruzado el 90% en la misma sesión: la fila ya se borró y hay
  // un play de hace segundos → no se registra otro.
  assert.equal(
    shouldRecordCompletion({ wasInProgress: false, hasRecentPlay: true }),
    false,
  );
});

test('salto directo al final sin ping previo <90% (sin fila, sin play reciente) → registra', () => {
  // El usuario abre el episodio y salta al 92% antes del primer ping <90%: no hay
  // fila, pero tampoco un play reciente → cuenta como visto.
  assert.equal(
    shouldRecordCompletion({ wasInProgress: false, hasRecentPlay: false }),
    true,
  );
});

test('objeto parcial: los parámetros ausentes se tratan como false', () => {
  // Solo sesión en curso → registra.
  assert.equal(shouldRecordCompletion({ wasInProgress: true }), true);
  // Solo play reciente, sin sesión → no registra (ping de cola).
  assert.equal(shouldRecordCompletion({ hasRecentPlay: true }), false);
  // Vacío = ni en curso ni play reciente = caso "salto al final sin nada previo" → registra.
  assert.equal(shouldRecordCompletion({}), true);
  assert.equal(shouldRecordCompletion(), true);
});

test('el cooldown es un margen razonable (colapsa sesión, permite rewatch posterior)', () => {
  // Mayor que el hueco entre pings (~30 s) y menor que un día.
  assert.ok(REWATCH_COMPLETION_COOLDOWN_MS > 60 * 1000);
  assert.ok(REWATCH_COMPLETION_COOLDOWN_MS < 24 * 60 * 60 * 1000);
});
