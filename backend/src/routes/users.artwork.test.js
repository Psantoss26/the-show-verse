import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyArtworkChanges,
  getArtworkOverrides,
} from './users.js';

test('artwork preferences are isolated by title and preserve the other image kinds', () => {
  const settings = applyArtworkChanges({}, [
    { type: 'movie', id: 550, kind: 'poster', filePath: '/poster-a.jpg' },
    { type: 'movie', id: 550, kind: 'logo', filePath: '/logo-a.png' },
    { type: 'tv', id: 1399, kind: 'mobilePoster', filePath: '/poster-b.jpg' },
  ]);

  assert.deepEqual(getArtworkOverrides(settings, { type: 'movie', ids: [550] }), {
    '550': { poster: '/poster-a.jpg', logo: '/logo-a.png' },
  });
  assert.deepEqual(getArtworkOverrides(settings, { type: 'tv', ids: [1399] }), {
    '1399': { mobilePoster: '/poster-b.jpg' },
  });
});

test('artwork reset removes every override and restores the default image source', () => {
  const selected = applyArtworkChanges({}, [
    { type: 'movie', id: 550, kind: 'poster', filePath: '/poster-a.jpg' },
    { type: 'movie', id: 550, kind: 'mobilePoster', filePath: '/poster-mobile.jpg' },
    { type: 'movie', id: 550, kind: 'backdrop', filePath: '/backdrop-a.jpg' },
    { type: 'movie', id: 550, kind: 'background', filePath: '/background-a.jpg' },
    { type: 'movie', id: 550, kind: 'logo', filePath: '/logo-a.png' },
  ]);
  const reset = applyArtworkChanges(selected, [
    { type: 'movie', id: 550, kind: 'poster', filePath: null },
    { type: 'movie', id: 550, kind: 'mobilePoster', filePath: null },
    { type: 'movie', id: 550, kind: 'backdrop', filePath: null },
    { type: 'movie', id: 550, kind: 'background', filePath: null },
    { type: 'movie', id: 550, kind: 'logo', filePath: null },
  ]);

  assert.deepEqual(getArtworkOverrides(reset, { type: 'movie', ids: [550] }), {
    '550': {},
  });
});
