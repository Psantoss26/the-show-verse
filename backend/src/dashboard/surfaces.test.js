// backend/src/dashboard/surfaces.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SURFACES, personalizedRowDefs } from './surfaces.js';

const rec = (id, mt, score, reasons = []) => ({
  tmdbId: id, mediaType: mt, title: `T${id}`, score, reasons, genreIds: [],
});

test('each surface defines media types and generic rows', () => {
  for (const key of ['home', 'movies', 'series']) {
    const s = SURFACES[key];
    assert.ok(Array.isArray(s.mediaTypes) && s.mediaTypes.length >= 1);
    assert.ok(s.genericRows.length >= 4);
    for (const r of s.genericRows) assert.ok(r.key && r.title && r.source?.kind);
  }
  assert.deepEqual(SURFACES.movies.mediaTypes, ['movie']);
  assert.deepEqual(SURFACES.series.mediaTypes, ['tv']);
});

test('personalizedRowDefs builds a rotating, seen-capped, mixed "Para ti" on home', () => {
  const recs = Array.from({ length: 30 }, (_, i) => rec(i + 1, i % 2 ? 'tv' : 'movie', 30 - i));
  const rows = personalizedRowDefs(
    { movie: recs.filter((r) => r.mediaType === 'movie'), tv: recs.filter((r) => r.mediaType === 'tv') },
    SURFACES.home,
  );
  const forYou = rows.find((r) => r.key === 'for_you');
  assert.ok(forYou);
  assert.equal(forYou.rotate, true);                 // rotación → variedad entre superficies
  assert.equal(forYou.mediaType, 'mixed');
  assert.ok(forYou.seenRatioLimit > 0 && forYou.seenRatioLimit < 1); // límite de vistos
  const types = new Set(forYou.items.map((i) => i.mediaType));
  assert.ok(types.has('movie') && types.has('tv'));  // mezcla pelis y series en Inicio
});

test('personalizedRowDefs "Porque viste" only with a because-reason and >=15 items, capped tighter than Para ti', () => {
  const liked = Array.from({ length: 16 }, (_, i) =>
    rec(100 + i, 'movie', 50 - i, [{ type: 'because', seedTmdbId: 99, seedTitle: 'Origen' }]));
  const noReason = Array.from({ length: 5 }, (_, i) => rec(200 + i, 'movie', 10 - i));
  const rows = personalizedRowDefs({ movie: [...liked, ...noReason] }, SURFACES.movies);
  const because = rows.find((r) => r.key === 'because_99');
  const forYou = rows.find((r) => r.key === 'for_you');
  assert.ok(because, 'crea la fila porque hay >=15 candidatos con razón');
  assert.equal(because.title, 'Porque viste Origen');
  assert.ok(because.seenRatioLimit <= forYou.seenRatioLimit); // "porque viste" admite menos vistos
});

test('personalizedRowDefs drops a "Porque viste" group below 15 items', () => {
  const liked = Array.from({ length: 10 }, (_, i) =>
    rec(100 + i, 'movie', 50 - i, [{ type: 'because', seedTmdbId: 99, seedTitle: 'Origen' }]));
  const rows = personalizedRowDefs({ movie: liked }, SURFACES.movies);
  assert.equal(rows.find((r) => r.key === 'because_99'), undefined);
});
