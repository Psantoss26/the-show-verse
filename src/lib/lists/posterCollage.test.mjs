import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
    buildBackgroundCollageTargets,
    buildBackgroundCollageTiles,
    getPosterCollageGrid,
    buildPosterCollageTargets,
    buildPosterCollageTiles,
    getCompletePosterCollageTileCount,
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

test('getPosterCollageLayout defines complete arrangements only', () => {
    for (const count of [2, 3, 4, 5, 6, 7, 8, 12, 16, 20]) {
        const layout = getPosterCollageLayout(count)
        assert.ok(layout.gridClassName)
        assert.equal(layout.tileClassNames.length, count)
    }

    assert.deepEqual(getPosterCollageLayout(3).tileClassNames, ['row-span-2', '', ''])
    assert.deepEqual(getPosterCollageLayout(7).tileClassNames, ['col-span-2 row-span-3', '', '', '', '', '', ''])
})

test('las listas largas ocultan la fila final incompleta de la portada', () => {
    assert.equal(getCompletePosterCollageTileCount(9), 8)
    assert.equal(getCompletePosterCollageTileCount(11), 8)
    assert.equal(getCompletePosterCollageTileCount(13), 12)
    assert.equal(getCompletePosterCollageTileCount(15), 12)
    assert.equal(getCompletePosterCollageTileCount(17), 16)
    assert.equal(getCompletePosterCollageTileCount(19), 16)

    assert.equal(buildPosterCollageTiles(Array.from({ length: 11 }, (_, index) => `/${index}.jpg`)).length, 8)
    assert.equal(buildPosterCollageTiles(Array.from({ length: 15 }, (_, index) => `/${index}.jpg`)).length, 12)
    assert.equal(buildPosterCollageTiles(Array.from({ length: 19 }, (_, index) => `/${index}.jpg`)).length, 16)

    assert.equal(getPosterCollageLayout(9).gridClassName, 'grid-cols-4 grid-rows-2')
    assert.equal(getPosterCollageLayout(12).gridClassName, 'grid-cols-4 grid-rows-3')
    assert.equal(getPosterCollageLayout(13).gridClassName, 'grid-cols-4 grid-rows-3')
    assert.equal(getPosterCollageLayout(16).gridClassName, 'grid-cols-4 grid-rows-4')
    assert.equal(getPosterCollageLayout(17).gridClassName, 'grid-cols-4 grid-rows-4')
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

// La portada usa arte SIN texto (`coverPoster`, lib/tmdb/artworkPicks): el
// mosaico recorta cada imagen a su celda y con el póster inglés cortaba los
// títulos impresos.
test('the list detail header waits for preloaded textless cover artwork instead of rendering stored posters', async () => {
    const source = await readFile(listDetailsLayoutUrl, 'utf8')

    assert.match(source, /coverPoster/)
    assert.match(source, /requestListArtwork/)
    assert.match(source, /preloadPoster/)
    assert.match(source, /useCoverArtImages\(posterItems\)/)
    assert.doesNotMatch(source, /fallbackImage/)
})

test('el fondo móvil sigue la rejilla de la portada', () => {
    assert.deepEqual(getPosterCollageGrid(20), { cols: 4, rows: 5 })
    assert.deepEqual(getPosterCollageGrid(12), { cols: 4, rows: 3 })
    assert.deepEqual(getPosterCollageGrid(2), { cols: 2, rows: 1 })
})

test('el fondo móvil toma los primeros títulos, en orden y sin repetir, hasta cuarenta', () => {
    const items = [
        { id: 1, media_type: 'movie' },
        { id: 1, media_type: 'movie' },
        { id: 2, media_type: 'tv' },
        ...Array.from({ length: 60 }, (_, index) => ({ id: 100 + index, media_type: 'movie' })),
    ]
    const targets = buildBackgroundCollageTargets(items, 99)
    assert.equal(targets.length, 40)
    assert.deepEqual(targets.slice(0, 3).map((target) => target.key), ['movie:1', 'tv:2', 'movie:100'])
})

test('el fondo móvil empieza por la portada, sigue con el resto y repite si faltan', () => {
    const cover = ['https://x/w342/a.jpg', 'https://x/w342/b.jpg']
    const extra = ['https://x/w185/b.jpg', 'https://x/w185/c.jpg']
    assert.deepEqual(buildBackgroundCollageTiles(cover, extra, 5), [
        'https://x/w342/a.jpg',
        'https://x/w342/b.jpg',
        'https://x/w185/c.jpg',
        'https://x/w342/a.jpg',
        'https://x/w342/b.jpg',
    ])
    assert.deepEqual(buildBackgroundCollageTiles([], [], 4), [])
})
