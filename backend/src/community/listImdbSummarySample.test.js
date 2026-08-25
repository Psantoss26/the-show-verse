import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMUNITY_IMDB_SUMMARY_SAMPLE_SIZE,
  selectCommunityImdbSummarySample,
} from './listImdbSummarySample.js';

test('la muestra de IMDb de una lista comunitaria supera una página visual sin repetir títulos', () => {
  const items = Array.from({ length: 180 }, (_, index) => ({
    tmdbId: index + 1,
    mediaType: index % 2 ? 'tv' : 'movie',
  }));
  items.splice(1, 0, { ...items[0] });

  const sample = selectCommunityImdbSummarySample(items);

  assert.equal(COMMUNITY_IMDB_SUMMARY_SAMPLE_SIZE, 120);
  assert.equal(sample.length, 120);
  assert.equal(new Set(sample.map((item) => `${item.mediaType}:${item.tmdbId}`)).size, 120);
  assert.deepEqual(sample[0], { tmdbId: 1, mediaType: 'movie' });
  assert.deepEqual(sample.at(-1), { tmdbId: 180, mediaType: 'tv' });
});
