import assert from 'node:assert/strict';
import test from 'node:test';
import { checkTmdbPosters, clearPosterCheckCache, pickGalleryPoster } from './posterlessItems.js';

const response = (status, body = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

test('pickGalleryPoster prefiere inglés, luego sin idioma, luego cualquiera', () => {
  assert.equal(pickGalleryPoster([]), null);
  assert.equal(
    pickGalleryPoster([
      { file_path: '/es.jpg', iso_639_1: 'es', vote_average: 9 },
      { file_path: '/null.jpg', iso_639_1: null, vote_average: 5 },
      { file_path: '/en-low.jpg', iso_639_1: 'en', vote_average: 1 },
      { file_path: '/en-top.jpg', iso_639_1: 'en', vote_average: 7 },
    ]),
    '/en-top.jpg',
  );
  assert.equal(pickGalleryPoster([{ file_path: '/de.jpg', iso_639_1: 'de' }]), '/de.jpg');
});

test('clasifica 404 y galería vacía como sin póster, y los errores como desconocidos', async () => {
  clearPosterCheckCache();
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes('/movie/1/')) return response(404);
    if (url.includes('/movie/2/')) return response(200, { posters: [] });
    if (url.includes('/movie/3/')) return response(200, { posters: [{ file_path: '/de.jpg', iso_639_1: 'de' }] });
    if (url.includes('/tv/4/')) return response(429);
    throw new Error('red');
  };
  const results = await checkTmdbPosters(
    [
      { mediaType: 'movie', tmdbId: 1 },
      { mediaType: 'movie', tmdbId: 2 },
      { mediaType: 'movie', tmdbId: 3 },
      { mediaType: 'show', tmdbId: 4 },
      { mediaType: 'movie', tmdbId: 5 },
      { mediaType: 'movie', tmdbId: 1 },
    ],
    { fetchImpl, apiKey: 'k' },
  );
  assert.deepEqual(results.get('movie:1'), { status: 'missing' });
  assert.deepEqual(results.get('movie:2'), { status: 'missing' });
  assert.deepEqual(results.get('movie:3'), { status: 'poster', posterPath: '/de.jpg' });
  assert.deepEqual(results.get('tv:4'), { status: 'unknown' });
  assert.deepEqual(results.get('movie:5'), { status: 'unknown' });
  // Sin idioma: la galería completa. Y cada título una sola vez.
  assert.ok(calls.every((url) => !url.includes('language=')));
  assert.equal(calls.length, 5);
});

test('recuerda los títulos sin póster y respeta el tope por respuesta', async () => {
  clearPosterCheckCache();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return response(404);
  };
  await checkTmdbPosters([{ mediaType: 'movie', tmdbId: 9 }], { fetchImpl, apiKey: 'k', now: 1000 });
  const again = await checkTmdbPosters([{ mediaType: 'movie', tmdbId: 9 }], { fetchImpl, apiKey: 'k', now: 2000 });
  assert.equal(calls, 1);
  assert.deepEqual(again.get('movie:9'), { status: 'missing' });

  const many = Array.from({ length: 5 }, (_, i) => ({ mediaType: 'movie', tmdbId: 100 + i }));
  const capped = await checkTmdbPosters(many, { fetchImpl, apiKey: 'k', max: 2 });
  assert.equal([...capped.values()].filter((r) => r.status === 'unknown').length, 3);
});
