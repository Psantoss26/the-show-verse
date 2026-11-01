import assert from 'node:assert/strict';
import test from 'node:test';

import { pickTopVotedArtwork, pickTopVotedArtworkByTitle } from './artworkVotes.js';

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

test('por título: la más votada de cada uno, sin mezclarlos', () => {
  assert.deepEqual(
    pickTopVotedArtworkByTitle([
      { tmdbId: 1, kind: 'poster', filePath: '/a.jpg', votes: 1, lastVotedAt: '2026-10-01T00:00:00Z' },
      { tmdbId: 1, kind: 'poster', filePath: '/b.jpg', votes: 2, lastVotedAt: '2026-09-01T00:00:00Z' },
      { tmdbId: 2, kind: 'poster', filePath: '/c.jpg', votes: 1, lastVotedAt: '2026-09-01T00:00:00Z' },
      { tmdbId: 3, kind: 'otro', filePath: '/x.jpg', votes: 5 },
    ]),
    { 1: { poster: '/b.jpg' }, 2: { poster: '/c.jpg' } },
  );
});

test('la elegida por una cuenta curadora gana aunque tenga menos votos', () => {
  assert.deepEqual(
    pickTopVotedArtwork([
      { kind: 'logo', filePath: '/popular.png', votes: 12, lastVotedAt: '2026-10-30T00:00:00Z', curated: false },
      { kind: 'logo', filePath: '/curada.png', votes: 1, lastVotedAt: '2026-01-01T00:00:00Z', curated: true },
      { kind: 'poster', filePath: '/a.jpg', votes: 1, lastVotedAt: '2026-01-01T00:00:00Z', curated: false },
      { kind: 'poster', filePath: '/b.jpg', votes: 4, lastVotedAt: '2026-01-01T00:00:00Z', curated: false },
    ]),
    { logo: '/curada.png', poster: '/b.jpg' },
  );
});

test('por título: la curada manda en su título y no toca los demás', () => {
  assert.deepEqual(
    pickTopVotedArtworkByTitle([
      { tmdbId: 1, kind: 'poster', filePath: '/curada.jpg', votes: 2, lastVotedAt: '2026-01-01T00:00:00Z', curated: true },
      { tmdbId: 1, kind: 'poster', filePath: '/votada.jpg', votes: 9, lastVotedAt: '2026-10-01T00:00:00Z' },
      { tmdbId: 2, kind: 'poster', filePath: '/votada.jpg', votes: 9, lastVotedAt: '2026-10-01T00:00:00Z' },
    ]),
    { 1: { poster: '/curada.jpg' }, 2: { poster: '/votada.jpg' } },
  );
});
