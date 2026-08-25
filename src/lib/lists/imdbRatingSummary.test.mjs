import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_IMDB_LIST_SAMPLE_SIZE,
  getListImdbItemKey,
  selectListImdbSample,
  summarizeListImdbRatings,
} from './imdbRatingSummary.js'

test('selectListImdbSample deduplicates title ids and distributes a bounded sample', () => {
  const sample = selectListImdbSample([
    { id: 1, media_type: 'movie' },
    { id: 1, media_type: 'movie' },
    { tmdbId: 2, mediaType: 'tv' },
    { id: 3, media_type: 'movie' },
    { id: 4, media_type: 'movie' },
    { id: 5, media_type: 'movie' },
  ], 3)

  assert.deepEqual(sample.map((item) => item.key), ['movie:1', 'movie:3', 'movie:5'])
  assert.equal(getListImdbItemKey({ id: 2, media_type: 'show' }), 'tv:2')
})

test('la muestra IMDb por defecto cubre hasta 120 títulos', () => {
  const items = Array.from({ length: 160 }, (_, index) => ({
    id: index + 1,
    media_type: 'movie',
  }))
  const sample = selectListImdbSample(items)

  assert.equal(MAX_IMDB_LIST_SAMPLE_SIZE, 120)
  assert.equal(sample.length, 120)
  assert.equal(sample[0].key, 'movie:1')
  assert.equal(sample.at(-1).key, 'movie:160')
})

test('summarizeListImdbRatings reports rated coverage against the complete list', () => {
  const sample = [{ key: 'movie:1' }, { key: 'tv:2' }, { key: 'movie:3' }]
  const summary = summarizeListImdbRatings(sample, {
    'movie:1': { rating: 8.4 },
    'tv:2': { rating: 7.6 },
  }, 120)

  assert.deepEqual(summary, { average: 8, ratedCount: 2, totalCount: 120 })
})
