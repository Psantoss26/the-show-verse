import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ARTWORK_PREFERENCES_CACHE_KEY,
  forgetCommunityArtwork,
  getCardArtwork,
  getOwnCardPoster,
  retractOwnArtworkVotes,
  notifyPersistedArtworkOverridesChanged,
  resolveCardArtwork,
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

test('cualquier capa: el logo propio sale de la misma memoria', async () => {
  const { getOwnArtwork } = await import('./artworkApi.js')
  installWindow(
    memoryStorage({
      [ARTWORK_PREFERENCES_CACHE_KEY]: snapshot({ 'tv:7': { logo: '/logo.png', poster: '/p.jpg' } })
    })
  )
  assert.equal(getOwnArtwork('tv', 7, 'logo'), '/logo.png')
  assert.equal(getOwnArtwork('show', 7, 'poster'), '/p.jpg')
  assert.equal(getOwnArtwork('tv', 7, 'backdrop'), null)
  delete globalThis.window
})

test('tarjetas: sin elección propia, la más votada, pedida por lotes', async () => {
  installWindow(
    memoryStorage({
      [ARTWORK_PREFERENCES_CACHE_KEY]: snapshot({ 'movie:701': { poster: '/propia.jpg' } })
    })
  )
  const requests = []
  globalThis.fetch = async (url) => {
    // Los lotes que dejaron en cola otros tests (series) no cuentan.
    if (String(url).includes('type=movie')) requests.push(String(url))
    return {
      ok: true,
      json: async () => ({
        artwork: {
          701: { poster: '/votada-701.jpg' },
          702: { poster: '/votada-702.jpg', cardBackdrop: '/fondo-702.jpg' }
        }
      })
    }
  }
  let calls = 0
  const unsubscribe = subscribeOwnCardPosters(() => {
    calls += 1
  })
  // El aviso de `installWindow` aún estaba en cola.
  await Promise.resolve()
  calls = 0

  // La propia manda y no pide nada; las demás aún no se saben.
  assert.equal(getCardArtwork('movie', 701, 'poster'), '/propia.jpg')
  assert.equal(getCardArtwork('movie', 702, 'poster'), null)
  assert.equal(getCardArtwork('movie', 703, 'cardBackdrop'), null)
  assert.equal(getCardArtwork('movie', 702, 'cardBackdrop'), null)
  await new Promise((resolve) => setTimeout(resolve, 40))

  // Un solo lote con las dos que faltaban.
  assert.equal(requests.length, 1)
  assert.match(requests[0], /type=movie&ids=702,703$/)
  assert.equal(calls, 1)
  assert.equal(getCardArtwork('movie', 702, 'poster'), '/votada-702.jpg')
  assert.equal(getCardArtwork('movie', 702, 'cardBackdrop'), '/fondo-702.jpg')
  // Resuelta sin votos: ya no se vuelve a pedir.
  assert.equal(getCardArtwork('movie', 703, 'cardBackdrop'), null)
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.equal(requests.length, 1)

  // Retirar el voto propio la quita ya; olvidarla la vuelve a pedir.
  retractOwnArtworkVotes({ type: 'movie', id: 702, votes: { poster: '/votada-702.jpg' } })
  assert.equal(getCardArtwork('movie', 702, 'poster'), null)
  assert.equal(getCardArtwork('movie', 702, 'cardBackdrop'), '/fondo-702.jpg')
  forgetCommunityArtwork({ type: 'movie', id: 702 })
  getCardArtwork('movie', 702, 'poster')
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.equal(requests.length, 2)
  assert.equal(getCardArtwork('movie', 702, 'poster'), '/votada-702.jpg')
  unsubscribe()
  delete globalThis.fetch
})


test('tarjetas: la votada que lee la ficha pasa a la copia por lotes', async () => {
  const { rememberCommunityCardArtwork } = await import('./artworkApi.js')
  installWindow(memoryStorage({ [ARTWORK_PREFERENCES_CACHE_KEY]: snapshot({}) }))
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ artwork: {} }) })
  let calls = 0
  const unsubscribe = subscribeOwnCardPosters(() => {
    calls += 1
  })
  // Favoritos ya preguntó antes del voto de otro usuario: «sin votos».
  assert.equal(getCardArtwork('movie', 801, 'poster'), null)
  await new Promise((resolve) => setTimeout(resolve, 40))
  calls = 0
  assert.equal(getCardArtwork('movie', 801, 'poster'), null)

  // La ficha la trae (SSR o consulta del título): las tarjetas la usan ya.
  rememberCommunityCardArtwork({ type: 'movie', id: 801 }, { poster: '/de-otro.jpg' })
  assert.equal(getCardArtwork('movie', 801, 'poster'), '/de-otro.jpg')
  await Promise.resolve()
  assert.equal(calls, 1)

  // La misma otra vez no vuelve a renderizar las tarjetas.
  rememberCommunityCardArtwork({ type: 'movie', id: 801 }, { poster: '/de-otro.jpg' })
  await Promise.resolve()
  assert.equal(calls, 1)
  unsubscribe()
  delete globalThis.fetch
})

test('compartir: espera a la más votada y la propia gana', async () => {
  installWindow(
    memoryStorage({
      [ARTWORK_PREFERENCES_CACHE_KEY]: snapshot({ 'movie:9701': { poster: '/propia.jpg' } })
    })
  )
  const requests = []
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    requests.push(String(url))
    return {
      ok: true,
      json: async () => ({ artwork: { 9702: { poster: '/votada.jpg' }, 9801: { poster: '/serie.jpg' } } })
    }
  }
  try {
    const resolved = await resolveCardArtwork(
      [
        { id: 9701, mediaType: 'movie' },
        { id: 9702, mediaType: 'movie' },
        { id: 9703, mediaType: 'movie' },
        { id: 9801, mediaType: 'tv' }
      ],
      'poster'
    )
    assert.equal(resolved.get('movie:9701'), '/propia.jpg')
    assert.equal(resolved.get('movie:9702'), '/votada.jpg')
    assert.equal(resolved.get('movie:9703'), null)
    assert.equal(resolved.get('tv:9801'), '/serie.jpg')
    // Un lote por tipo y sin pedir la que ya tiene elección propia.
    assert.deepEqual(requests.sort(), [
      '/api/community/artwork?type=movie&ids=9702,9703',
      '/api/community/artwork?type=tv&ids=9801'
    ])
  } finally {
    globalThis.fetch = previousFetch
  }
})
