import test from 'node:test'
import assert from 'node:assert/strict'
import {
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

test('summarizeListImdbRatings reports rated coverage against the complete list', () => {
  const sample = [{ key: 'movie:1' }, { key: 'tv:2' }, { key: 'movie:3' }]
  const summary = summarizeListImdbRatings(sample, {
    'movie:1': { rating: 8.4 },
    'tv:2': { rating: 7.6 },
  }, 120)

  assert.deepEqual(summary, { average: 8, ratedCount: 2, totalCount: 120 })
})
