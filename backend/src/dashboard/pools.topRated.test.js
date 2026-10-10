// backend/src/dashboard/pools.topRated.test.js
// En un archivo aparte: `tmdb.js` lee TMDB_API_KEY al importarse, así que la
// clave de prueba tiene que estar puesta ANTES de cargar `pools.js`.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('"Mejor valoradas" solo admite títulos con más de 5000 votos', async (t) => {
  const originalKey = process.env.TMDB_API_KEY;
  process.env.TMDB_API_KEY = 'test-key';
  t.after(() => {
    if (originalKey === undefined) delete process.env.TMDB_API_KEY;
    else process.env.TMDB_API_KEY = originalKey;
  });
  const { POOL_DEFS, TOP_RATED_MIN_VOTES, poolStorageKey } = await import(
    './pools.js?top-rated-test'
  );

  assert.ok(TOP_RATED_MIN_VOTES > 5000);

  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    requests.push(url);
    const page = Number(url.searchParams.get('page'));
    // TMDB podría devolver alguno justo en el límite: el pool lo descarta igual.
    const results =
      page === 1
        ? [
            { id: 1, name: 'Muy votada', poster_path: '/a.jpg', vote_average: 8.9, vote_count: 24000, genre_ids: [18], original_language: 'en' },
            { id: 2, name: 'Justo 5001', poster_path: '/b.jpg', vote_average: 8.7, vote_count: 5001, genre_ids: [18], original_language: 'en' },
            { id: 3, name: 'Justo 5000', poster_path: '/c.jpg', vote_average: 9.0, vote_count: 5000, genre_ids: [18], original_language: 'en' },
            { id: 4, name: 'Pocos votos', poster_path: '/d.jpg', vote_average: 9.2, vote_count: 900, genre_ids: [18], original_language: 'en' },
          ]
        : [];
    return { ok: true, json: async () => ({ results }) };
  });

  for (const mediaType of ['movie', 'tv']) {
    const def = POOL_DEFS.get(`top_rated:${mediaType}`);
    // Criterio nuevo → clave de almacenamiento nueva: no se sirven los items
    // cacheados con el piso anterior.
    assert.equal(poolStorageKey(def), 'top_rated:v2.votes5000');

    requests.length = 0;
    const items = await def.build();

    assert.ok(requests.length > 0);
    for (const url of requests) {
      assert.match(url.pathname, new RegExp(`/discover/${mediaType}$`));
      assert.equal(url.searchParams.get('vote_count.gte'), String(TOP_RATED_MIN_VOTES));
      assert.equal(url.searchParams.get('sort_by'), 'vote_average.desc');
    }
    assert.deepEqual(
      items.map((card) => card.tmdbId),
      [1, 2],
    );
    assert.ok(items.every((card) => card.voteCount > 5000));
  }
});
