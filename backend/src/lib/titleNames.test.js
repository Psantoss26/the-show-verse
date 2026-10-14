import assert from 'node:assert/strict';
import test from 'node:test';

import { parseTitleNameKeys, titleNamesFromTmdb } from './titleNames.js';

test('parseTitleNameKeys acepta solo movie/tv con id positivo, sin repetir y con tope', () => {
  assert.deepEqual(parseTitleNameKeys('movie:603, tv:1396,movie:603,season:1,tv:0,tv:abc'), ['movie:603', 'tv:1396']);
  assert.equal(parseTitleNameKeys(Array.from({ length: 150 }, (_, i) => `movie:${i + 1}`)).length, 100);
  assert.deepEqual(parseTitleNameKeys(''), []);
});

test('titleNamesFromTmdb: inglés de la ficha, español de las traducciones (es-ES primero)', () => {
  assert.deepEqual(
    titleNamesFromTmdb('movie', {
      title: 'Spirited Away',
      original_title: '千と千尋の神隠し',
      translations: {
        translations: [
          { iso_639_1: 'es', iso_3166_1: 'MX', data: { title: 'El viaje de Chihiro (MX)' } },
          { iso_639_1: 'es', iso_3166_1: 'ES', data: { title: 'El viaje de Chihiro' } },
        ],
      },
    }),
    { en: 'Spirited Away', es: 'El viaje de Chihiro', original: '千と千尋の神隠し' },
  );
});

test('titleNamesFromTmdb: series por name; sin traducción española vale el original', () => {
  assert.deepEqual(
    titleNamesFromTmdb('tv', {
      name: 'Money Heist',
      original_name: 'La casa de papel',
      translations: { translations: [{ iso_639_1: 'es', iso_3166_1: 'ES', data: { name: '' } }] },
    }),
    { en: 'Money Heist', es: 'La casa de papel', original: 'La casa de papel' },
  );
  // Solo hay traducción de otro país hispanohablante.
  assert.equal(
    titleNamesFromTmdb('tv', {
      name: 'X',
      original_name: 'Y',
      translations: { translations: [{ iso_639_1: 'es', iso_3166_1: 'AR', data: { name: 'Z' } }] },
    }).es,
    'Z',
  );
});
