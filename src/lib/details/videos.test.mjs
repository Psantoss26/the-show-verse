import assert from 'node:assert/strict'
import test from 'node:test'

import { pickPreferredVideo, videoTypeOptions } from './videos.js'

test('a trailer wins over official featurettes and teasers', () => {
    const videos = [
        {
            key: 'featurette',
            site: 'YouTube',
            type: 'Featurette',
            iso_639_1: 'en',
            official: true
        },
        {
            key: 'official-teaser',
            site: 'YouTube',
            type: 'Teaser',
            iso_639_1: 'en',
            official: true
        },
        {
            key: 'trailer',
            site: 'YouTube',
            type: 'Trailer',
            iso_639_1: 'en',
            official: false
        }
    ]

    assert.equal(pickPreferredVideo(videos)?.key, 'trailer')
})

test('an English trailer wins over a Spanish trailer', () => {
    const videos = [
        {
            key: 'spanish-trailer',
            site: 'YouTube',
            type: 'Trailer',
            iso_639_1: 'es',
            official: true
        },
        {
            key: 'english-trailer',
            site: 'YouTube',
            type: 'Trailer',
            iso_639_1: 'en',
            official: false
        }
    ]

    assert.equal(pickPreferredVideo(videos)?.key, 'english-trailer')
})

test('official status breaks ties after type and language', () => {
    const videos = [
        {
            key: 'unofficial-trailer',
            site: 'YouTube',
            type: 'Trailer',
            iso_639_1: 'en',
            official: false
        },
        {
            key: 'official-trailer',
            site: 'YouTube',
            type: 'Trailer',
            iso_639_1: 'en',
            official: true
        }
    ]

    assert.equal(pickPreferredVideo(videos)?.key, 'official-trailer')
})

test('videoTypeOptions keeps the list order and counts each type', () => {
    const options = videoTypeOptions([
        { key: 'a', type: 'Trailer' },
        { key: 'b', type: 'Teaser' },
        { key: 'c', type: 'Trailer' },
        { key: 'd', type: 'Behind the Scenes' },
        { key: 'e' }
    ])
    assert.deepEqual(options, [
        { type: 'Trailer', count: 2, label: 'Tráiler' },
        { type: 'Teaser', count: 1, label: 'Teaser' },
        { type: 'Behind the Scenes', count: 1, label: 'Detrás de las cámaras' },
        { type: 'Other', count: 1, label: 'Vídeo' }
    ])
})
