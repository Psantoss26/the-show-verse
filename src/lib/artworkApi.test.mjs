import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ARTWORK_PREFERENCES_CACHE_KEY,
  applyArtworkOverrideChanges,
  readArtworkPreference,
  readPersistedArtworkOverride,
  readPersistedArtworkOverrides,
  resolveCachedArtworkOverride,
  writeArtworkPreference
} from './artworkApi.js'

// Almacenamiento de mentira con el contenido exacto que AuthContext cachea.
function snapshotStorage(preferences) {
  const raw =
    typeof preferences === 'string' ? preferences : JSON.stringify(preferences)
  return {
    getItem(key) {
      return key === ARTWORK_PREFERENCES_CACHE_KEY ? raw : null
    },
    setItem() {},
    removeItem() {}
  }
}

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

test('the persisted snapshot answers positives and negatives without the network', () => {
  const storage = snapshotStorage({
    defaultView: 'grid',
    uiSettings: {
      artworkOverrides: {
        'movie:10': { mobilePoster: '/mobile.jpg', logo: '/logo.png' },
        'tv:7': { poster: '/serie.jpg' }
      }
    }
  })

  assert.deepEqual(readPersistedArtworkOverride({ type: 'movie', id: 10, storage }), {
    mobilePoster: '/mobile.jpg',
    logo: '/logo.png'
  })
  // Un título sin selección propia se confirma como negativo: `{}`, no `null`.
  assert.deepEqual(readPersistedArtworkOverride({ type: 'movie', id: 11, storage }), {})
  // `show` es el alias de `tv` que usa DetailsClient.
  assert.deepEqual(readPersistedArtworkOverride({ type: 'show', id: 7, storage }), {
    poster: '/serie.jpg'
  })
  // Los ids llegan como cadena desde la ruta.
  assert.deepEqual(readPersistedArtworkOverride({ type: 'movie', id: '10', storage }), {
    mobilePoster: '/mobile.jpg',
    logo: '/logo.png'
  })
})

test('a stored snapshot without overrides still confirms negatives', () => {
  const storage = snapshotStorage({ defaultView: 'grid', uiSettings: {} })

  assert.deepEqual(readPersistedArtworkOverrides(storage), {})
  assert.deepEqual(readPersistedArtworkOverride({ type: 'movie', id: 10, storage }), {})
})

test('without a usable snapshot the caller must keep waiting for the network', () => {
  const empty = {
    getItem() {
      return null
    },
    setItem() {},
    removeItem() {}
  }
  assert.equal(readPersistedArtworkOverrides(empty), null)
  assert.equal(readPersistedArtworkOverride({ type: 'movie', id: 10, storage: empty }), null)

  const corrupt = snapshotStorage('{no es json')
  assert.equal(readPersistedArtworkOverrides(corrupt), null)

  const unreadable = {
    getItem() {
      throw new Error('Storage unavailable')
    },
    setItem() {},
    removeItem() {}
  }
  assert.equal(readPersistedArtworkOverrides(unreadable), null)

  // Un blob que no es un objeto de preferencias no puede confirmar nada.
  assert.equal(readPersistedArtworkOverrides(snapshotStorage('"texto"')), null)
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
