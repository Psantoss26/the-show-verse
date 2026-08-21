import test from 'node:test'
import assert from 'node:assert/strict'
import { pickBestFavoriteEnglishPoster } from './tmdbImages.js'

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
