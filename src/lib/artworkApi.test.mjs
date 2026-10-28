import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ARTWORK_PREFERENCES_CACHE_KEY,
  applyArtworkOverrideChanges,
  readArtworkPreference,
  readPersistedArtworkOverride,
  readPersistedArtworkOverrides,
  forgetCommunityArtwork,
  resolveCachedArtworkOverride,
  retractOwnArtworkVotes,
  saveArtworkOverride,
  shouldSkipRemoteArtwork,
  subscribeCommunityArtwork,
  withCommunityArtwork,
  withoutArtworkVotes,
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

test('overrides are only skipped on mobile view over an external network', () => {
  const external = 'theshowverse.com'
  const local = '192.168.1.130'

  assert.equal(
    shouldSkipRemoteArtwork({ mobileViewport: true, hostname: external, localHosts: [] }),
    true
  )
  // En la red del servidor la consulta es local: no compensa apagar nada.
  assert.equal(
    shouldSkipRemoteArtwork({ mobileViewport: true, hostname: local, localHosts: [] }),
    false
  )
  // Escritorio y tablet conservan la funcionalidad aunque estén fuera.
  assert.equal(
    shouldSkipRemoteArtwork({ mobileViewport: false, hostname: external, localHosts: [] }),
    false
  )
  // Sin datos (render de servidor) no se apaga nada.
  assert.equal(shouldSkipRemoteArtwork({ mobileViewport: true, localHosts: [] }), false)
  assert.equal(shouldSkipRemoteArtwork(), false)
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

// fetch de mentira que devuelve los estados indicados, uno por llamada.
function mockFetchStatuses(t, statuses) {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push(JSON.parse(init.body))
    const status = statuses[Math.min(calls.length - 1, statuses.length - 1)]
    if (status === 'network') throw new TypeError('Failed to fetch')
    return { ok: status >= 200 && status < 300, status }
  })
  t.mock.method(console, 'error', () => {})
  return calls
}

test('a transient failure saving artwork is retried until the account keeps it', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const calls = mockFetchStatuses(t, ['network', 503, 200])

  const saved = saveArtworkOverride({ type: 'tv', id: 7, kind: 'background', filePath: '/b.jpg' })
  for (let i = 0; i < 20 && calls.length < 3; i += 1) {
    await new Promise((resolve) => setImmediate(resolve))
    t.mock.timers.tick(3000)
  }

  assert.equal(await saved, true)
  assert.equal(calls.length, 3)
  assert.deepEqual(calls[2].artworkChanges, [
    { type: 'tv', id: 7, kind: 'background', filePath: '/b.jpg' }
  ])
})

test('a rejected artwork save (4xx) is not retried', async (t) => {
  const calls = mockFetchStatuses(t, [401])

  const saved = await saveArtworkOverride({ type: 'movie', id: 1, kind: 'logo', filePath: '/l.png' })

  assert.equal(saved, false)
  assert.equal(calls.length, 1)
})

test('withCommunityArtwork: la más votada rellena solo los tipos sin selección propia', () => {
    assert.deepEqual(
        withCommunityArtwork(
            { poster: '/mia.jpg' },
            { poster: '/votada.jpg', mobilePoster: '/votada-movil.jpg' }
        ),
        { poster: '/mia.jpg', mobilePoster: '/votada-movil.jpg' }
    )
})

test('withCommunityArtwork: sin votos devuelve los overrides tal cual', () => {
    assert.equal(withCommunityArtwork(null, null), null)
    const own = { logo: '/logo.png' }
    assert.equal(withCommunityArtwork(own, null), own)
})

test('withCommunityArtwork: sin overrides remotos vale la copia local por título', () => {
    assert.deepEqual(
        withCommunityArtwork(null, { backdrop: '/votado.jpg', logo: '/logo-votado.png' }, {
            backdrop: '/local.jpg',
            logo: null
        }),
        { backdrop: '/local.jpg', logo: '/logo-votado.png' }
    )
})

test('withoutArtworkVotes: quita de la más votada solo los votos propios indicados', () => {
    const community = { poster: '/propio.jpg', logo: '/logo-ajeno.png', backdrop: '/b.jpg' }
    assert.deepEqual(
        withoutArtworkVotes(community, { poster: new Set(['/antiguo.jpg', '/propio.jpg']), logo: '/otro.png' }),
        { logo: '/logo-ajeno.png', backdrop: '/b.jpg' }
    )
    assert.equal(withoutArtworkVotes(community, { poster: ['/otro.jpg'] }), community)
    assert.equal(withoutArtworkVotes(null, { poster: '/propio.jpg' }), null)
})

test('subscribeCommunityArtwork: restablecer avisa a las páginas montadas del título', () => {
    const events = []
    const unsubscribe = subscribeCommunityArtwork({ type: 'show', id: '42' }, (event) => events.push(event))
    const other = []
    subscribeCommunityArtwork({ type: 'movie', id: 42 }, (event) => other.push(event))

    retractOwnArtworkVotes({ type: 'tv', id: 42, votes: { poster: '/propio.jpg' } })
    forgetCommunityArtwork({ type: 'tv', id: 42 })
    assert.deepEqual(events, [{ retract: { poster: '/propio.jpg' } }, { refresh: true }])
    assert.deepEqual(other, [])

    unsubscribe()
    forgetCommunityArtwork({ type: 'tv', id: 42 })
    assert.equal(events.length, 2)
})
