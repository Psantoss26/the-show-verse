import test from 'node:test'
import assert from 'node:assert/strict'
import {
  pickBestBackdropForPreview,
  pickBestFavoriteEnglishPoster,
  pickPosterByLanguage,
} from './tmdbImages.js'

test('pickBestFavoriteEnglishPoster uses the Favorites ordering and ignores non-English posters', () => {
  const selected = pickBestFavoriteEnglishPoster([
    { file_path: '/spanish.jpg', iso_639_1: 'es', vote_count: 1000 },
    { file_path: '/english-low.jpg', iso_639_1: 'en', vote_count: 4, width: 1000 },
    { file_path: '/english-best.jpg', iso_639_1: 'en-US', vote_count: 12, vote_average: 5, width: 500 },
    { file_path: '/english-tie.jpg', iso_639_1: 'en', vote_count: 12, vote_average: 5, width: 600 },
  ])

  assert.equal(selected?.file_path, '/english-tie.jpg')
  assert.equal(pickBestFavoriteEnglishPoster([{ file_path: '/es.jpg', iso_639_1: 'es' }]), null)
})

test('pickBestBackdropForPreview keeps an English backdrop when it is below the preferred resolution', () => {
  const selected = pickBestBackdropForPreview([
    { file_path: '/spanish-1920.jpg', iso_639_1: 'es', width: 1920, height: 1080 },
    { file_path: '/english-1000.jpg', iso_639_1: 'en', width: 1000, height: 563 },
  ])

  assert.equal(selected, '/english-1000.jpg')
})

test('pickPosterByLanguage elige por posición entre los del idioma, en el orden de TMDb', () => {
  const posters = [
    { file_path: '/es.jpg', iso_639_1: 'es', vote_average: 9 },
    { file_path: '/en-1.jpg', iso_639_1: 'en', vote_average: 4 },
    { file_path: '/none.jpg', iso_639_1: null },
    { file_path: '/en-2.jpg', iso_639_1: 'en', vote_average: 8 },
  ]
  assert.equal(pickPosterByLanguage(posters, 'en')?.file_path, '/en-1.jpg')
  assert.equal(pickPosterByLanguage(posters, 'en', 1)?.file_path, '/en-2.jpg')
  // Con menos de los pedidos, el último que haya.
  assert.equal(pickPosterByLanguage(posters.slice(0, 2), 'en', 1)?.file_path, '/en-1.jpg')
  assert.equal(pickPosterByLanguage(posters, 'fr', 1), null)
  assert.equal(pickPosterByLanguage(null, 'en'), null)
})
