// backend/src/lib/showProgress.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeShowProgress } from './showProgress.js';

// Serie de 2 temporadas: T1 = 3 episodios, T2 = 2 episodios (5 emitidos).
const COUNTS = { 1: 3, 2: 2 };

// Construye un Map de plays: { '1-1': 2, '1-2': 1, ... }
const plays = (obj) => new Map(Object.entries(obj));

test('primer visionado a medias → en progreso, no completada, no rewatch', () => {
  const p = computeShowProgress(plays({ '1-1': 1, '1-2': 1 }), COUNTS);
  assert.equal(p.aired, 5);
  assert.equal(p.distinctWatched, 2);
  assert.equal(p.completedRuns, 0);
  assert.equal(p.runCompleted, 2);
  assert.equal(p.runActive, true);
  assert.equal(p.baseComplete, false);
  assert.equal(p.isRewatch, false);
  assert.deepEqual(p.runNextEpisode, { season: 1, number: 3, title: null });
});

test('vista 1 vez completa, sin rewatch → completada, NO en progreso', () => {
  const p = computeShowProgress(
    plays({ '1-1': 1, '1-2': 1, '1-3': 1, '2-1': 1, '2-2': 1 }),
    COUNTS,
  );
  assert.equal(p.completedRuns, 1);
  assert.equal(p.baseComplete, true);
  assert.equal(p.runActive, false); // no hay run activo (capa 2 vacía)
  assert.equal(p.runCompleted, 0);
  assert.equal(p.isRewatch, true); // el (hipotético) run actual sería rewatch
});

test('completada + rewatch en curso → en progreso (progreso del rewatch) Y completada', () => {
  // Todos vistos 1 vez (completada); 2 episodios re-vistos (capa 2).
  const p = computeShowProgress(
    plays({ '1-1': 2, '1-2': 2, '1-3': 1, '2-1': 1, '2-2': 1 }),
    COUNTS,
  );
  assert.equal(p.completedRuns, 1); // completada 1 vez
  assert.equal(p.baseComplete, true); // sigue completada
  assert.equal(p.runActive, true); // rewatch activo
  assert.equal(p.runCompleted, 2); // 2 episodios re-vistos
  assert.equal(p.runPct, 40); // 2/5
  assert.equal(p.isRewatch, true);
  // siguiente del rewatch = primer episodio aún sin re-ver (capa 2)
  assert.deepEqual(p.runNextEpisode, { season: 1, number: 3, title: null });
});

test('rewatch COMPLETO (todos re-vistos) → completada 2 veces, NO en progreso', () => {
  const p = computeShowProgress(
    plays({ '1-1': 2, '1-2': 2, '1-3': 2, '2-1': 2, '2-2': 2 }),
    COUNTS,
  );
  assert.equal(p.completedRuns, 2);
  assert.equal(p.baseComplete, true);
  assert.equal(p.runActive, false); // capa 3 vacía → sin rewatch activo
  assert.equal(p.runCompleted, 0);
});

test('segundo rewatch en curso (completada 2 veces + 1 re-visto en capa 3)', () => {
  const p = computeShowProgress(
    plays({ '1-1': 3, '1-2': 2, '1-3': 2, '2-1': 2, '2-2': 2 }),
    COUNTS,
  );
  assert.equal(p.completedRuns, 2);
  assert.equal(p.runActive, true);
  assert.equal(p.runCompleted, 1); // solo 1-1 en capa 3
  assert.deepEqual(p.runNextEpisode, { season: 1, number: 2, title: null });
});

test('episodios no emitidos (fuera de rango) se ignoran', () => {
  const p = computeShowProgress(
    plays({ '1-1': 1, '1-2': 1, '1-3': 1, '2-1': 1, '2-2': 1, '99-9': 5 }),
    COUNTS,
  );
  assert.equal(p.distinctWatched, 5);
  assert.equal(p.baseComplete, true);
});

test('sin emitidos conocidos → heredado: en progreso por vistos, sin run/rewatch', () => {
  const p = computeShowProgress(plays({ '1-1': 1, '1-2': 3 }), {});
  assert.equal(p.hasKnownAired, false);
  assert.equal(p.distinctWatched, 2);
  assert.equal(p.runActive, false);
  assert.equal(p.baseComplete, false);
  assert.equal(p.isRewatch, false);
  assert.equal(p.runNextEpisode, null);
});

test('sin nada visto → nada activo', () => {
  const p = computeShowProgress(new Map(), COUNTS);
  assert.equal(p.distinctWatched, 0);
  assert.equal(p.runActive, false);
  assert.equal(p.baseComplete, false);
  assert.equal(p.completedRuns, 0);
});
