import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ARTWORK_PREFERENCES_CACHE_KEY,
  getOwnCardPoster,
  notifyPersistedArtworkOverridesChanged,
  subscribeOwnCardPosters
} from './artworkApi.js'

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  let reads = 0
  return {
    get reads() {
      return reads
    },
    getItem: (key) => {
      reads += 1
      return data.has(key) ? data.get(key) : null
    },
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key)
  }
}

function installWindow(storage) {
  globalThis.window = {
    localStorage: storage,
    sessionStorage: memoryStorage(),
    addEventListener() {}
  }
  notifyPersistedArtworkOverridesChanged()
}

const snapshot = (overrides) =>
  JSON.stringify({ uiSettings: { artworkOverrides: overrides } })

test('tarjetas: usan la portada de escritorio, nunca la del hero móvil', () => {
  installWindow(
    memoryStorage({
      [ARTWORK_PREFERENCES_CACHE_KEY]: snapshot({
        'movie:10': { poster: '/desk.jpg', mobilePoster: '/hero.jpg' },
        'tv:20': { mobilePoster: '/solo-hero.jpg' }
      })
    })
  )
  assert.equal(getOwnCardPoster('movie', 10), '/desk.jpg')
  assert.equal(getOwnCardPoster('show', 20), null)
  assert.equal(getOwnCardPoster('tv', 99), null)
})

test('tarjetas: la instantánea se parsea una vez hasta que AuthContext avisa', async () => {
  const storage = memoryStorage({
    [ARTWORK_PREFERENCES_CACHE_KEY]: snapshot({ 'movie:1': { poster: '/a.jpg' } })
  })
  installWindow(storage)
  getOwnCardPoster('movie', 1)
  const reads = storage.reads
  for (let i = 0; i < 50; i += 1) getOwnCardPoster('movie', 1)
  assert.equal(storage.reads, reads)

  let calls = 0
  const unsubscribe = subscribeOwnCardPosters(() => {
    calls += 1
  })
  storage.setItem(ARTWORK_PREFERENCES_CACHE_KEY, snapshot({ 'movie:1': { poster: '/b.jpg' } }))
  notifyPersistedArtworkOverridesChanged()
  notifyPersistedArtworkOverridesChanged()
  // La lectura ya ve el cambio; el aviso llega después (fuera del render de
  // quien escribió) y una sola vez por ráfaga.
  assert.equal(getOwnCardPoster('movie', 1), '/b.jpg')
  assert.equal(calls, 0)
  await Promise.resolve()
  assert.equal(calls, 1)
  unsubscribe()
})

test('tarjetas: sin instantánea de la cuenta, la copia local de la ficha', () => {
  installWindow(memoryStorage({ 'showverse:tv:5:poster': '/local.jpg' }))
  assert.equal(getOwnCardPoster('tv', 5), '/local.jpg')
  delete globalThis.window
})
