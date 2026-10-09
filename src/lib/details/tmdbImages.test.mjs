import test from 'node:test'
import assert from 'node:assert/strict'
import {
  pickBestBackdropForPreview,
  pickBestFavoriteEnglishPoster,
  pickTmdbDefaultPoster,
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

test('pickTmdbDefaultPoster elige como TMDb (nota, luego votos) solo entre los del idioma pedido', () => {
  const posters = [
    { file_path: '/es-top.jpg', iso_639_1: 'es', vote_average: 9, vote_count: 50 },
    { file_path: '/en-low.jpg', iso_639_1: 'en', vote_average: 5.2, vote_count: 10 },
    { file_path: '/en-top.jpg', iso_639_1: 'en', vote_average: 5.6, vote_count: 2 },
    { file_path: '/en-tie.jpg', iso_639_1: 'en', vote_average: 5.6, vote_count: 1 },
    { file_path: '/none.jpg', iso_639_1: null, vote_average: 10, vote_count: 99 },
  ]
  assert.equal(pickTmdbDefaultPoster(posters, 'en')?.file_path, '/en-top.jpg')
  assert.equal(pickTmdbDefaultPoster(posters, 'fr'), null)
  assert.equal(pickTmdbDefaultPoster(null, 'en'), null)
})
