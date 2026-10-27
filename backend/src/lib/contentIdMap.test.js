import assert from 'node:assert/strict';
import test from 'node:test';

import {
  contentTarget,
  decideContent,
  learnsFromDetection,
  mapContentId,
} from './contentIdMap.js';

test('mapContentId: only platforms whose playback id names the item', () => {
  assert.equal(mapContentId('netflix', '81234567'), '81234567');
  assert.equal(mapContentId('max', ' 0b8a-11ef '), '0b8a-11ef');
  assert.equal(mapContentId('crunchyroll', 'GRVN8MNQY'), 'GRVN8MNQY');
  // La ficha de Prime Video es la serie, no el episodio; Plex no cambia la URL.
  assert.equal(mapContentId('primevideo', 'B0ABC'), null);
  assert.equal(mapContentId('plex', '/library/metadata/1'), null);
  assert.equal(mapContentId('netflix', ''), null);
  assert.equal(mapContentId('netflix', 'a b'), null);
  assert.equal(mapContentId('netflix', 'x'.repeat(201)), null);
  assert.equal(mapContentId('netflix', null), null);
  // Un tramo genérico de la URL no identifica nada.
  assert.equal(mapContentId('max', 'urn'), null);
  assert.equal(mapContentId('max', 'urn:hbo:episode:GXkRjxwjR68PDwwEAABKJ'), 'urn:hbo:episode:GXkRjxwjR68PDwwEAABKJ');
});

test('contentTarget: a movie, or a concrete episode; never a bare series', () => {
  assert.deepEqual(
    contentTarget({ tmdbId: 1, mediaType: 'movie', season: 2, episode: 3, title: 'Peli' }),
    { tmdbId: 1, mediaType: 'movie', season: null, episode: null, title: 'Peli', posterPath: null },
  );
  assert.equal(contentTarget({ tmdbId: 1, mediaType: 'tv', season: 2, episode: null }), null);
  assert.equal(contentTarget({ tmdbId: 1, mediaType: 'tv', season: null, episode: 4 }), null);
  assert.equal(contentTarget({ tmdbId: 0, mediaType: 'movie' }), null);
  assert.deepEqual(contentTarget({ tmdbId: 7, mediaType: 'tv', season: 1, episode: 4 }).episode, 4);
});

test('learnsFromDetection: only confident playback not resolved by the map itself', () => {
  assert.equal(learnsFromDetection({ kind: 'playback', confidence: 'high', source: 'search' }), true);
  assert.equal(learnsFromDetection({ kind: 'playback', confidence: 'high', source: 'user_rule' }), true);
  assert.equal(learnsFromDetection({ kind: 'detail', confidence: 'high', source: 'search' }), false);
  assert.equal(learnsFromDetection({ kind: 'playback', confidence: 'medium', source: 'search' }), false);
  assert.equal(learnsFromDetection({ kind: 'playback', confidence: 'high', source: 'content_id' }), false);
});

test('decideContent: own row first, then a strict global consensus', () => {
  const a = { tmdbId: 1, mediaType: 'tv', season: 1, episode: 2, title: 'A', supporters: 3 };
  const b = { tmdbId: 9, mediaType: 'tv', season: 1, episode: 2, title: 'B', supporters: 1 };
  const own = { tmdbId: 5, mediaType: 'movie', season: null, episode: null, source: 'auto' };

  assert.deepEqual(decideContent(own, [a], 3), {
    scope: 'user', source: 'auto', tmdbId: 5, mediaType: 'movie', season: null, episode: null,
    title: null, posterPath: null,
  });
  const global = decideContent(null, [a, b], 3);
  assert.equal(global.scope, 'global');
  assert.equal(global.tmdbId, 1);
  assert.equal(global.supporters, 3);
  // Sin respaldo suficiente o con empate en cabeza, no decide nada.
  assert.equal(decideContent(null, [a], 4), null);
  assert.equal(decideContent(null, [a, { ...b, supporters: 3 }], 3), null);
  assert.equal(decideContent(null, [], 1), null);
});
