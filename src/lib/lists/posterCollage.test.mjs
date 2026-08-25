import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
    buildPosterCollageTargets,
    buildPosterCollageTiles,
    getPosterCollageLayout,
} from './posterCollage.js'

const listDetailsLayoutUrl = new URL('../../components/lists/UnifiedListDetailsLayout.jsx', import.meta.url)

test('buildPosterCollageTiles ignores empty values and duplicates', () => {
    assert.deepEqual(
        buildPosterCollageTiles(['', '/one.jpg', '/one.jpg', null, ' /two.jpg '], 2),
        ['/one.jpg', '/two.jpg'],
    )
})

test('buildPosterCollageTiles keeps short list covers unique', () => {
    assert.deepEqual(
        buildPosterCollageTiles(['/one.jpg', '/two.jpg']),
        ['/one.jpg', '/two.jpg'],
    )
})

test('buildPosterCollageTiles samples long lists across their full contents', () => {
    const posters = Array.from({ length: 30 }, (_, index) => `/${index + 1}.jpg`)
    const tiles = buildPosterCollageTiles(posters)

    assert.equal(tiles.length, 20)
    assert.equal(tiles[0], '/1.jpg')
    assert.equal(tiles.at(-1), '/30.jpg')
    assert.equal(new Set(tiles).size, 20)
})

test('getPosterCollageLayout defines a distinct, complete arrangement from two to twenty posters', () => {
    for (let count = 2; count <= 20; count += 1) {
        const layout = getPosterCollageLayout(count)
        assert.ok(layout.gridClassName)
        assert.equal(layout.tileClassNames.length, count)
    }

    assert.deepEqual(getPosterCollageLayout(3).tileClassNames, ['row-span-2', '', ''])
    assert.deepEqual(getPosterCollageLayout(7).tileClassNames, ['col-span-2 row-span-3', '', '', '', '', '', ''])
})

test('las listas largas crecen de tres a cinco filas sin repetir pósteres', () => {
    assert.equal(getPosterCollageLayout(9).gridClassName, 'grid-cols-4 grid-rows-3')
    assert.equal(getPosterCollageLayout(12).gridClassName, 'grid-cols-4 grid-rows-3')
    assert.equal(getPosterCollageLayout(13).gridClassName, 'grid-cols-4 grid-rows-4')
    assert.equal(getPosterCollageLayout(16).gridClassName, 'grid-cols-4 grid-rows-4')
    assert.equal(getPosterCollageLayout(17).gridClassName, 'grid-cols-4 grid-rows-5')
    assert.equal(getPosterCollageLayout(20).gridClassName, 'grid-cols-4 grid-rows-5')
})

test('buildPosterCollageTiles returns no tile without usable posters', () => {
    assert.deepEqual(buildPosterCollageTiles([null, '', undefined]), [])
})

test('buildPosterCollageTargets keeps only unique TMDb identities for final artwork', () => {
    assert.deepEqual(
        buildPosterCollageTargets([
            { id: 10, media_type: 'movie', poster_path: '/spanish.jpg' },
            { tmdbId: 10, mediaType: 'movie', posterPath: '/duplicate.jpg' },
            { id: 20, media_type: 'tv', poster_path: '/other.jpg' },
            { id: null, media_type: 'movie', poster_path: '/without-id.jpg' },
        ]),
        [
            { key: 'movie:10', tmdbId: 10, mediaType: 'movie' },
            { key: 'tv:20', tmdbId: 20, mediaType: 'tv' },
        ],
    )
})

test('the list detail header waits for preloaded English artwork instead of rendering stored posters', async () => {
    const source = await readFile(listDetailsLayoutUrl, 'utf8')

    assert.match(source, /pickBestFavoriteEnglishPoster/)
    assert.match(source, /preloadPoster/)
    assert.match(source, /useFinalEnglishPosterImages\(posterItems\)/)
    assert.doesNotMatch(source, /fallbackImage/)
})
