// backend/src/level/streaks.test.js
import assert from 'node:assert/strict';
import test from 'node:test';

import { computeStreaks } from './streaks.js';

// `today` se pasa siempre para que el test no dependa del reloj.
const TODAY = '2026-08-17';

test('sin actividad no hay racha', () => {
  assert.deepEqual(computeStreaks([], { today: TODAY }), {
    current: 0,
    longest: 0,
    activeDays: 0,
    lastActiveDate: null,
  });
});

test('actividad de hoy es una racha de un día', () => {
  const s = computeStreaks(['2026-08-17'], { today: TODAY });
  assert.equal(s.current, 1);
  assert.equal(s.longest, 1);
  assert.equal(s.activeDays, 1);
  assert.equal(s.lastActiveDate, '2026-08-17');
});

test('tres días seguidos hasta hoy son racha actual de tres', () => {
  const s = computeStreaks(['2026-08-15', '2026-08-16', '2026-08-17'], { today: TODAY });
  assert.equal(s.current, 3);
  assert.equal(s.longest, 3);
});

test('la racha sigue viva si la última actividad fue ayer', () => {
  // Ver algo cada noche y consultar el perfil por la mañana no debe romperla.
  const s = computeStreaks(['2026-08-15', '2026-08-16'], { today: TODAY });
  assert.equal(s.current, 2);
});

test('la racha se rompe si la última actividad fue anteayer', () => {
  const s = computeStreaks(['2026-08-14', '2026-08-15'], { today: TODAY });
  assert.equal(s.current, 0);
  assert.equal(s.longest, 2);
});

test('la racha máxima sobrevive a que la actual esté rota', () => {
  const s = computeStreaks(
    ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-08-17'],
    { today: TODAY },
  );
  assert.equal(s.longest, 4);
  assert.equal(s.current, 1);
});

test('los días repetidos cuentan una sola vez', () => {
  const s = computeStreaks(
    ['2026-08-16', '2026-08-16', '2026-08-17', '2026-08-17', '2026-08-17'],
    { today: TODAY },
  );
  assert.equal(s.activeDays, 2);
  assert.equal(s.current, 2);
});

test('las fechas desordenadas dan el mismo resultado', () => {
  const ordered = computeStreaks(['2026-08-15', '2026-08-16', '2026-08-17'], { today: TODAY });
  const shuffled = computeStreaks(['2026-08-17', '2026-08-15', '2026-08-16'], { today: TODAY });
  assert.deepEqual(shuffled, ordered);
});

test('cruza el cambio de mes y de año sin romper la racha', () => {
  const s = computeStreaks(['2025-12-30', '2025-12-31', '2026-01-01'], { today: '2026-01-01' });
  assert.equal(s.current, 3);
  assert.equal(s.longest, 3);
});

test('acepta objetos Date además de cadenas ISO', () => {
  const s = computeStreaks(
    [new Date('2026-08-16T22:30:00Z'), new Date('2026-08-17T01:00:00Z')],
    { today: TODAY },
  );
  assert.equal(s.activeDays, 2);
  assert.equal(s.current, 2);
});

test('descarta fechas inválidas en vez de contarlas', () => {
  const s = computeStreaks(['2026-08-17', null, undefined, 'no-es-fecha', ''], { today: TODAY });
  assert.equal(s.activeDays, 1);
  assert.equal(s.current, 1);
});

test('una actividad futura no inventa racha desde el futuro', () => {
  // Un import con fechas mal puede dejar filas por delante de hoy.
  const s = computeStreaks(['2026-09-01'], { today: TODAY });
  assert.equal(s.current, 0);
  assert.equal(s.activeDays, 1);
});
