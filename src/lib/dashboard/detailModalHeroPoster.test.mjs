import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  mergeUniqueImages,
  pickBestNeutralPosterByResVotes,
  pickModalHeroPosterPath
} from '../details/tmdbImages.js'

const DETAIL_MODAL = new URL(
  '../../components/dashboard/DetailModal.jsx',
  import.meta.url
)
const MODAL_DATA = new URL(
  '../../components/dashboard/useDetailModalData.js',
  import.meta.url
)

const POSTER_PATH = '/principal.jpg'
const POSTERS = [
  { file_path: '/principal.jpg', iso_639_1: 'es', width: 1000, height: 1500, vote_count: 40 },
  { file_path: '/neutro-grande.jpg', iso_639_1: null, width: 2000, height: 3000, vote_count: 5 },
  { file_path: '/neutro-pequeno.jpg', iso_639_1: null, width: 680, height: 1020, vote_count: 90 },
  { file_path: '/ingles.jpg', iso_639_1: 'en', width: 2000, height: 3000, vote_count: 900 }
]

// Lo que hace DetailsClient para su hero móvil: la portada principal entra en la
// galería marcada como `main` y el selector la descarta.
function clientMobileHeroPosterPath({ posterPath, profilePath, posters }) {
  const galleryPosters = mergeUniqueImages(
    posterPath ? [{ file_path: posterPath, from: 'main' }] : [],
    posters || []
  ).filter((poster) => poster?.file_path && poster.from !== 'main')

  return (
    pickBestNeutralPosterByResVotes(galleryPosters)?.file_path ||
    posterPath ||
    profilePath ||
    null
  )
}

test('el hero del modal elige la MISMA portada que la ficha móvil', () => {
  // Si esto deja de coincidir, el mismo título se ve con una portada en la
  // vista previa del drawer y con otra al abrir la ficha completa.
  assert.equal(
    pickModalHeroPosterPath({ mainPosterPath: POSTER_PATH, posters: POSTERS }),
    clientMobileHeroPosterPath({ posterPath: POSTER_PATH, posters: POSTERS })
  )
  assert.equal(
    pickModalHeroPosterPath({ mainPosterPath: POSTER_PATH, posters: POSTERS }),
    '/neutro-grande.jpg'
  )
})

test('la selección del usuario para móvil manda sobre el criterio automático', () => {
  assert.equal(
    pickModalHeroPosterPath({
      mobilePosterOverride: '/elegida-a-mano.jpg',
      posterOverride: '/escritorio.jpg',
      mainPosterPath: POSTER_PATH,
      posters: POSTERS
    }),
    '/elegida-a-mano.jpg'
  )
})

test('la portada de escritorio solo entra cuando la galería no da textless', () => {
  // Con galería: manda el textless, no la selección de escritorio.
  assert.equal(
    pickModalHeroPosterPath({
      posterOverride: '/escritorio.jpg',
      mainPosterPath: POSTER_PATH,
      posters: POSTERS
    }),
    '/neutro-grande.jpg'
  )
  // Sin galería: es el siguiente escalón, por delante de la portada principal.
  assert.equal(
    pickModalHeroPosterPath({
      posterOverride: '/escritorio.jpg',
      mainPosterPath: POSTER_PATH,
      posters: []
    }),
    '/escritorio.jpg'
  )
})

test('la ficha de teléfono no cae al backdrop antes de saber cuál es la portada', async () => {
  const modal = await readFile(DETAIL_MODAL, 'utf8')

  // El respaldo al backdrop es para los títulos SIN portada. Leerlo antes de
  // tiempo pintaba la backdrop recortada y la sustituía al llegar la portada:
  // el parpadeo. `heroPosterResolved` es la señal de "ya se sabe".
  assert.match(
    modal,
    /mobileDetails\s*\?\s*heroPosterSrc \|\| \(data\.heroPosterResolved \? heroBackdropSrc : null\)/
  )
})

test('`heroPosterResolved` se marca en TODAS las salidas', async () => {
  const hook = await readFile(MODAL_DATA, 'utf8')

  // Si alguna salida se lo dejara sin marcar, el hero de la ficha de teléfono
  // se quedaría con el esqueleto para siempre en ese caso.
  assert.match(hook, /heroPosterResolved: false/)
  const marks = hook.match(/heroPosterResolved: true|markResolved\(/g) || []
  assert.ok(
    marks.length >= 5,
    `se esperaban marcas en todas las salidas, encontradas ${marks.length}`
  )
})
