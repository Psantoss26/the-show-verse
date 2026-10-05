import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeTitleSearch } from './titleSearch.js';

test('deja solo películas y series, con los campos planos', () => {
  const out = normalizeTitleSearch([
    { id: 1, media_type: 'movie', title: 'Dune', release_date: '2021-09-15', poster_path: '/d.jpg' },
    { id: 2, media_type: 'person', name: 'Zendaya' },
    { id: 3, media_type: 'tv', name: 'Dark', first_air_date: '2017-12-01' },
  ]);
  assert.deepEqual(out, [
    { tmdbId: 1, mediaType: 'movie', title: 'Dune', year: 2021, posterPath: '/d.jpg' },
    { tmdbId: 3, mediaType: 'tv', title: 'Dark', year: 2017, posterPath: null },
  ]);
});

test('descarta duplicados, sin título o sin id válido', () => {
  const out = normalizeTitleSearch([
    { id: 1, media_type: 'movie', title: 'Dune' },
    { id: 1, media_type: 'movie', title: 'Dune' },
    { id: 0, media_type: 'movie', title: 'Cero' },
    { id: 4, media_type: 'tv', name: '  ' },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].year, null);
});

test('respeta el límite y tolera entradas que no son lista', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, media_type: 'movie', title: `T${i}` }));
  assert.equal(normalizeTitleSearch(many, 5).length, 5);
  assert.deepEqual(normalizeTitleSearch(null), []);
});
