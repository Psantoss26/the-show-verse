import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSeasonCoverChanges, readSeasonCustomPoster, seasonArtworkKey } from './seasonArtwork.js';

test('lee la portada elegida de la temporada por su id de TMDb', () => {
  const preferences = {
    uiSettings: {
      artworkOverrides: {
        [seasonArtworkKey(3572)]: { poster: '/elegido.jpg' },
        'tv:3572': { poster: '/serie.jpg' },
        'season:9': { poster: 'https://evil.example/x.jpg' },
      },
    },
  };
  assert.equal(readSeasonCustomPoster(preferences, 3572), '/elegido.jpg');
  assert.equal(readSeasonCustomPoster(preferences, 9), null);
  assert.equal(readSeasonCustomPoster(preferences, 1), null);
  assert.equal(readSeasonCustomPoster(null, 3572), null);
  assert.equal(readSeasonCustomPoster(preferences, null), null);
});

test('elegir otra guarda, volver al automático borra y sin cambios no hace nada', () => {
  assert.deepEqual(buildSeasonCoverChanges('/auto.jpg', '/auto.jpg', '/otro.jpg'), [{ kind: 'poster', filePath: '/otro.jpg' }]);
  assert.deepEqual(buildSeasonCoverChanges('/auto.jpg', '/otro.jpg', '/auto.jpg'), [{ kind: 'poster', filePath: null }]);
  assert.deepEqual(buildSeasonCoverChanges('/auto.jpg', '/otro.jpg', '/otro.jpg'), []);
  assert.throws(() => buildSeasonCoverChanges('/auto.jpg', '/auto.jpg', 'javascript:alert(1)'));
});
