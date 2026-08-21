import assert from 'node:assert/strict'
import test from 'node:test'

import { createImdbRatingRequestCoordinator } from './imdbRatingRequestCoordinator.js'

test('shares a request when the list effect mounts twice', async () => {
  const requestRatings = createImdbRatingRequestCoordinator()
  let calls = 0
  let releaseRequest
  const gate = new Promise((resolve) => {
    releaseRequest = resolve
  })
  const items = [{ key: 'movie:1' }]

  const firstSubscriber = requestRatings(items, async () => {
    calls += 1
    await gate
  })
  const secondSubscriber = requestRatings(items, async () => {
    calls += 1
  })

  assert.equal(calls, 0)
  await Promise.resolve()
  assert.equal(calls, 1)

  releaseRequest()
  await Promise.all([firstSubscriber, secondSubscriber])
})

test('releases failed keys so a future render can retry', async () => {
  const requestRatings = createImdbRatingRequestCoordinator()
  const items = [{ key: 'movie:1' }]

  await assert.rejects(
    requestRatings(items, async () => {
      throw new Error('temporary failure')
    }),
  )

  let retries = 0
  await requestRatings(items, async () => {
    retries += 1
  })

  assert.equal(retries, 1)
})
