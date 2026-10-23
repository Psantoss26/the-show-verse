import assert from 'node:assert/strict'
import test from 'node:test'

import {
  mergeUniqueImages,
  pickMobileNeutralPoster,
  pickMobileHeroPosterPath
} from './tmdbImages.js'

// Fixture con la forma real de TMDb: la principal está TAMBIÉN en la galería
// (es el caso habitual) y hay arte sin idioma de más resolución.
const POSTER_PATH = '/principal.jpg'
const POSTERS = [
  { file_path: '/principal.jpg', iso_639_1: 'es', width: 1000, height: 1500, vote_count: 40 },
  { file_path: '/neutro-grande.jpg', iso_639_1: null, width: 2000, height: 3000, vote_count: 5 },
  { file_path: '/neutro-pequeno.jpg', iso_639_1: null, width: 680, height: 1020, vote_count: 90 },
  { file_path: '/ingles.jpg', iso_639_1: 'en', width: 2000, height: 3000, vote_count: 900 }
]

// Reproduce lo que hace DetailsClient en el cliente: mete la portada principal
// marcada como `main`, fusiona la galería del SSR y descarta las `main`.
function clientMobileHeroPosterPath({ posterPath, profilePath, posters }) {
  const imagesStatePosters = mergeUniqueImages(
    posterPath ? [{ file_path: posterPath, from: 'main' }] : [],
    posters || []
  )
  const galleryPosters = imagesStatePosters.filter(
    (poster) => poster?.file_path && poster.from !== 'main'
  )
  return (
    pickMobileNeutralPoster(galleryPosters)?.file_path ||
    posterPath ||
    profilePath ||
    null
  )
}

test('the server helper picks what the client would pick', () => {
  const args = { posterPath: POSTER_PATH, posters: POSTERS }

  // Si esto deja de coincidir, la precarga del servidor apunta a una imagen que
  // el cliente no va a pedir y se descarga una portada de más.
  assert.equal(pickMobileHeroPosterPath(args), clientMobileHeroPosterPath(args))
  assert.equal(pickMobileHeroPosterPath(args), '/neutro-grande.jpg')
})

test('the main poster is the last resort, never the gallery pick', () => {
  // Sin galería solo queda la principal.
  assert.equal(
    pickMobileHeroPosterPath({ posterPath: POSTER_PATH, posters: [] }),
    POSTER_PATH
  )
  // Una galería que SOLO contiene la principal equivale a no tener galería:
  // el filtro por `file_path` la descarta igual que el `from: "main"` del cliente.
  assert.equal(
    pickMobileHeroPosterPath({
      posterPath: POSTER_PATH,
      posters: [{ file_path: POSTER_PATH, width: 1000, height: 1500 }]
    }),
    POSTER_PATH
  )
  assert.equal(
    clientMobileHeroPosterPath({
      posterPath: POSTER_PATH,
      posters: [{ file_path: POSTER_PATH, width: 1000, height: 1500 }]
    }),
    POSTER_PATH
  )
})

test('falls back to the profile path and then to nothing', () => {
  assert.equal(
    pickMobileHeroPosterPath({ profilePath: '/perfil.jpg', posters: [] }),
    '/perfil.jpg'
  )
  assert.equal(pickMobileHeroPosterPath({}), null)
  assert.equal(pickMobileHeroPosterPath(), null)
})

test('only the first two textless posters compete, by resolution', () => {
  const posters = [
    { file_path: '/es.jpg', iso_639_1: 'es', width: 2000, height: 3000 },
    { file_path: '/neutro-1.jpg', iso_639_1: null, width: 1000, height: 1500 },
    { file_path: '/neutro-2.jpg', iso_639_1: null, width: 1400, height: 2100 },
    { file_path: '/neutro-3.jpg', iso_639_1: null, width: 2000, height: 3000 }
  ]
  // La tercera es la más grande, pero queda fuera de las dos primeras.
  assert.equal(pickMobileHeroPosterPath({ posters }), '/neutro-2.jpg')
  assert.equal(pickMobileHeroPosterPath({ posters }), clientMobileHeroPosterPath({ posters }))
  // En empate de resolución gana la primera.
  const tie = posters.map((p) => (p.file_path === '/neutro-2.jpg' ? { ...p, width: 1000, height: 1500 } : p))
  assert.equal(pickMobileHeroPosterPath({ posters: tie }), '/neutro-1.jpg')
})
