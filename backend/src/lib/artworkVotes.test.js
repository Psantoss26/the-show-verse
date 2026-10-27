import assert from 'node:assert/strict';
import test from 'node:test';

import { pickTopVotedArtwork } from './artworkVotes.js';

test('una sola selección ya es la imagen por defecto de su tipo', () => {
  assert.deepEqual(
    pickTopVotedArtwork([
      { kind: 'mobilePoster', filePath: '/elegida.jpg', votes: 1, lastVotedAt: '2026-10-27T10:00:00Z' },
    ]),
    { mobilePoster: '/elegida.jpg' },
  );
});

test('gana la más votada de cada tipo, sin mezclar tipos', () => {
  assert.deepEqual(
    pickTopVotedArtwork([
      { kind: 'poster', filePath: '/a.jpg', votes: 2, lastVotedAt: '2026-10-01T00:00:00Z' },
      { kind: 'poster', filePath: '/b.jpg', votes: 5, lastVotedAt: '2026-09-01T00:00:00Z' },
      { kind: 'logo', filePath: '/logo.png', votes: 1, lastVotedAt: '2026-09-01T00:00:00Z' },
    ]),
    { poster: '/b.jpg', logo: '/logo.png' },
  );
});

test('empate: gana la elegida más recientemente', () => {
  assert.deepEqual(
    pickTopVotedArtwork([
      { kind: 'backdrop', filePath: '/vieja.jpg', votes: 3, lastVotedAt: '2026-01-01T00:00:00Z' },
      { kind: 'backdrop', filePath: '/nueva.jpg', votes: 3, lastVotedAt: '2026-10-01T00:00:00Z' },
    ]),
    { backdrop: '/nueva.jpg' },
  );
});

test('ignora tipos desconocidos y rutas vacías', () => {
  assert.deepEqual(
    pickTopVotedArtwork([
      { kind: 'otro', filePath: '/x.jpg', votes: 9 },
      { kind: 'poster', filePath: '', votes: 9 },
    ]),
    {},
  );
});
