import assert from 'node:assert/strict'
import test from 'node:test'

import {
    isLanguageNeutralImage,
    pickBestBackdropTVNeutralFirst,
    pickBestNeutralBackdropByResVotes,
    resolveNeutralBackdropPath
} from './tmdbImages.js'

test('a neutral backdrop always wins over a higher-voted localized backdrop', () => {
    const backdrops = [
        {
            file_path: '/localized.jpg',
            iso_639_1: 'en',
            width: 3840,
            height: 2160,
            vote_count: 500,
            vote_average: 9
        },
        {
            file_path: '/neutral.jpg',
            iso_639_1: null,
            width: 1920,
            height: 1080,
            vote_count: 1,
            vote_average: 5
        }
    ]

    assert.equal(pickBestBackdropTVNeutralFirst(backdrops), '/neutral.jpg')
})

test('localized and metadata-less backdrops are never used as neutral fallbacks', () => {
    const backdrops = [
        { file_path: '/spanish.jpg', iso_639_1: 'es' },
        { file_path: '/unknown-language.jpg' }
    ]

    assert.equal(pickBestBackdropTVNeutralFirst(backdrops), null)
    assert.equal(isLanguageNeutralImage(backdrops[0]), false)
    assert.equal(isLanguageNeutralImage(backdrops[1]), false)
})

test('the best-quality candidate is selected from neutral backdrops only', () => {
    const best = pickBestNeutralBackdropByResVotes([
        {
            file_path: '/neutral-720p.jpg',
            iso_639_1: null,
            width: 1280,
            height: 720,
            vote_count: 100
        },
        {
            file_path: '/neutral-4k.jpg',
            iso_639_1: null,
            width: 3840,
            height: 2160,
            vote_count: 2
        },
        {
            file_path: '/english-4k.jpg',
            iso_639_1: 'en',
            width: 3840,
            height: 2160,
            vote_count: 1000
        }
    ])

    assert.equal(best?.file_path, '/neutral-4k.jpg')
})

test('saved localized or metadata-less paths cannot override a neutral background', () => {
    const backdrops = [
        { file_path: '/localized.jpg', iso_639_1: 'es' },
        { file_path: '/metadata-less.jpg' },
        {
            file_path: '/neutral.jpg',
            iso_639_1: null,
            width: 1920,
            height: 1080
        }
    ]

    assert.equal(
        resolveNeutralBackdropPath(backdrops, [
            '/localized.jpg',
            '/metadata-less.jpg'
        ]),
        '/neutral.jpg'
    )
})
