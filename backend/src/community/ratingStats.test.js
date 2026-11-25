import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRatingBuckets } from './ratingStats.js';

test('sin filas: media nula, cero votos y 10 barras vacías', () => {
  const out = summarizeRatingBuckets([]);
  assert.equal(out.count, 0);
  assert.equal(out.average, null);
  assert.equal(out.histogram.length, 10);
  assert.deepEqual(out.histogram.map((b) => b.score), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.ok(out.histogram.every((b) => b.count === 0));
});

test('agrupa las medias notas en su entero inferior y calcula la media real', () => {
  // Filas como las devuelve la consulta: nota exacta y cuántos la dieron.
  const out = summarizeRatingBuckets([
    { rating: 9.5, count: 2 },
    { rating: 9, count: 1 },
    { rating: 10, count: 1 },
    { rating: 1, count: 1 },
  ]);
  assert.equal(out.count, 5);
  // (9.5*2 + 9 + 10 + 1) / 5 = 39 / 5 = 7.8
  assert.equal(out.average, 7.8);
  const byScore = Object.fromEntries(out.histogram.map((b) => [b.score, b.count]));
  assert.equal(byScore[9], 3);
  assert.equal(byScore[10], 1);
  assert.equal(byScore[1], 1);
  assert.equal(byScore[5], 0);
});

test('redondea la media a dos decimales y descarta valores fuera de rango', () => {
  const out = summarizeRatingBuckets([
    { rating: 7, count: 2 },
    { rating: 8, count: 1 },
    { rating: 0, count: 4 },
    { rating: 11, count: 4 },
    { rating: 'x', count: 1 },
    { rating: 6, count: 0 },
  ]);
  assert.equal(out.count, 3);
  assert.equal(out.average, 7.33);
});

test('acepta recuentos que llegan como texto (bigint de Postgres)', () => {
  const out = summarizeRatingBuckets([{ rating: '8.5', count: '3' }]);
  assert.equal(out.count, 3);
  assert.equal(out.average, 8.5);
  assert.equal(out.histogram[7].count, 3);
});
