import assert from 'node:assert/strict';
import test from 'node:test';
import { withoutShowLevelDuplicates } from './progress.js';

test('Continuar viendo no repite la serie entera junto a uno de sus episodios', () => {
  const rows = [
    { id: 1, tmdbId: 37680, mediaType: 'tv', season: 0, episode: 0 },
    { id: 2, tmdbId: 37680, mediaType: 'tv', season: 6, episode: 9 },
    { id: 3, tmdbId: 273240, mediaType: 'tv', season: 0, episode: 0 },
    { id: 4, tmdbId: 687163, mediaType: 'movie', season: 0, episode: 0 },
  ];
  assert.deepEqual(withoutShowLevelDuplicates(rows).map((r) => r.id), [2, 3, 4]);
});
