import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyArtworkOverrideChanges,
  readArtworkPreference,
  resolveCachedArtworkOverride,
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

test('a complete cached snapshot unlocks titles with and without overrides', () => {
  const preferences = {
    uiSettings: {
      artworkOverrides: {
        'movie:10': { mobilePoster: '/mobile.jpg', logo: '/logo.png' }
      }
    }
  }

  assert.deepEqual(
    resolveCachedArtworkOverride({
      preferences,
      cached: true,
      authenticated: true,
      type: 'movie',
      id: 10
    }),
    { mobilePoster: '/mobile.jpg', logo: '/logo.png' }
  )
  assert.deepEqual(
    resolveCachedArtworkOverride({
      preferences,
      cached: true,
      authenticated: true,
      type: 'movie',
      id: 11
    }),
    {}
  )
  assert.equal(
    resolveCachedArtworkOverride({
      preferences,
      cached: false,
      authenticated: true,
      type: 'movie',
      id: 10
    }),
    null
  )
})

test('artwork cache changes preserve other titles and remove empty entries', () => {
  const original = {
    defaultView: 'grid',
    uiSettings: {
      artworkOverrides: {
        'movie:1': { poster: '/one.jpg' },
        'tv:2': { logo: '/old.png', background: '/bg.jpg' }
      }
    }
  }

  const changed = applyArtworkOverrideChanges(original, {
    type: 'tv',
    id: 2,
    changes: [
      { kind: 'logo', filePath: '/new.png' },
      { kind: 'background', filePath: null }
    ]
  })
  assert.deepEqual(changed.uiSettings.artworkOverrides, {
    'movie:1': { poster: '/one.jpg' },
    'tv:2': { logo: '/new.png' }
  })

  const reset = applyArtworkOverrideChanges(changed, {
    type: 'tv',
    id: 2,
    changes: [{ kind: 'logo', filePath: null }]
  })
  assert.deepEqual(reset.uiSettings.artworkOverrides, {
    'movie:1': { poster: '/one.jpg' }
  })
})
