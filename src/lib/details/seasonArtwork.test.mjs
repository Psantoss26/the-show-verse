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

test('cada elección se guarda tal cual, Restaurar la borra y sin cambios no hace nada', () => {
  assert.deepEqual(buildSeasonCoverChanges(null, '/otro.jpg'), [{ kind: 'poster', filePath: '/otro.jpg' }]);
  // Elegir la automática también es un voto.
  assert.deepEqual(buildSeasonCoverChanges('/otro.jpg', '/auto.jpg'), [{ kind: 'poster', filePath: '/auto.jpg' }]);
  assert.deepEqual(buildSeasonCoverChanges('/otro.jpg', null), [{ kind: 'poster', filePath: null }]);
  assert.deepEqual(buildSeasonCoverChanges('/otro.jpg', '/otro.jpg'), []);
  assert.deepEqual(buildSeasonCoverChanges(null, null), []);
  assert.throws(() => buildSeasonCoverChanges(null, 'javascript:alert(1)'));
});
