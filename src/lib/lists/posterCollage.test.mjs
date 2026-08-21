import assert from 'node:assert/strict'
import test from 'node:test'

import { buildPosterCollageTiles } from './posterCollage.js'

test('buildPosterCollageTiles ignores empty values and duplicates', () => {
    assert.deepEqual(
        buildPosterCollageTiles(['', '/one.jpg', '/one.jpg', null, ' /two.jpg '], 2),
        ['/one.jpg', '/two.jpg'],
    )
})

test('buildPosterCollageTiles fills the portrait collage for short lists', () => {
    assert.deepEqual(
        buildPosterCollageTiles(['/one.jpg', '/two.jpg']),
        ['/one.jpg', '/two.jpg', '/one.jpg', '/two.jpg', '/one.jpg', '/two.jpg', '/one.jpg', '/two.jpg', '/one.jpg'],
    )
})

test('buildPosterCollageTiles samples long lists across their full contents', () => {
    assert.deepEqual(
        buildPosterCollageTiles(['/1.jpg', '/2.jpg', '/3.jpg', '/4.jpg', '/5.jpg', '/6.jpg', '/7.jpg', '/8.jpg', '/9.jpg', '/10.jpg']),
        ['/1.jpg', '/2.jpg', '/3.jpg', '/4.jpg', '/6.jpg', '/7.jpg', '/8.jpg', '/9.jpg', '/10.jpg'],
    )
})

test('buildPosterCollageTiles returns no tile without usable posters', () => {
    assert.deepEqual(buildPosterCollageTiles([null, '', undefined]), [])
})
