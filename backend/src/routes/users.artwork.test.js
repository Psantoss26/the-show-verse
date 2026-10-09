import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyArtworkChanges,
  artworkChangeSchema,
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

test('collections keep their artwork apart from the movie with the same id', () => {
  const settings = applyArtworkChanges({}, [
    { type: 'movie', id: 10, kind: 'poster', filePath: '/movie.jpg' },
    { type: 'collection', id: 10, kind: 'poster', filePath: '/collection.jpg' },
    { type: 'collection', id: 10, kind: 'backdrop', filePath: '/collection-bg.jpg' },
  ]);

  assert.deepEqual(getArtworkOverrides(settings, { type: 'collection', ids: [10] }), {
    '10': { poster: '/collection.jpg', backdrop: '/collection-bg.jpg' },
  });
  assert.deepEqual(getArtworkOverrides(settings, { type: 'movie', ids: [10] }), {
    '10': { poster: '/movie.jpg' },
  });
});

test('seasons accept a cover by their TMDb season id, apart from the show', () => {
  const change = artworkChangeSchema.parse({ type: 'season', id: '3572', kind: 'poster', filePath: '/season.jpg' });
  assert.equal(change.id, 3572);
  assert.equal(artworkChangeSchema.safeParse({ type: 'episode', id: 1, kind: 'poster', filePath: '/x.jpg' }).success, false);

  const settings = applyArtworkChanges({}, [
    { type: 'tv', id: 3572, kind: 'poster', filePath: '/show.jpg' },
    change,
  ]);
  assert.deepEqual(getArtworkOverrides(settings, { type: 'season', ids: [3572] }), {
    '3572': { poster: '/season.jpg' },
  });
  assert.deepEqual(getArtworkOverrides(settings, { type: 'tv', ids: [3572] }), {
    '3572': { poster: '/show.jpg' },
  });
});

