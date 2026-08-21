import test from 'node:test'
import assert from 'node:assert/strict'
import { ratingSummaryBadge, summarizeListRatings } from './ratingSummary.js'

test('summarizeListRatings ignores unrated titles and reports coverage', () => {
  const summary = summarizeListRatings([
    { vote_average: 8.2 },
    { voteAverage: 7.4 },
    { vote_average: 0 },
    { vote_average: null },
  ])

  assert.deepEqual(summary, { average: 7.8, ratedCount: 2, totalCount: 4 })
  assert.deepEqual(ratingSummaryBadge(summary), { value: '7.8', sub: '2/4' })
})

test('summarizeListRatings does not invent a score when no title has one', () => {
  assert.equal(summarizeListRatings([{ vote_average: 0 }, {}]), null)
  assert.equal(ratingSummaryBadge(null), null)
})
