import assert from 'node:assert/strict'
import test from 'node:test'

import {
  readArtworkPreference,
  writeArtworkPreference
} from './artworkApi.js'

test('keeps an artwork selection for the session when browser storage rejects writes', () => {
  const storage = {
    getItem() {
      throw new Error('Storage unavailable')
    },
    setItem() {
      throw new Error('Storage unavailable')
    },
    removeItem() {
      throw new Error('Storage unavailable')
    }
  }
  const key = 'test:artwork:mobilePoster'

  assert.equal(writeArtworkPreference(key, '/chosen-poster.jpg', storage), false)
  assert.equal(readArtworkPreference(key, storage), '/chosen-poster.jpg')

  assert.equal(writeArtworkPreference(key, null, storage), false)
  assert.equal(readArtworkPreference(key, storage), null)
})
