import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchTraktTrending, mergeTrendingCandidates } from './trending.js';

test('Trakt trending keeps its order, valid unique TMDb ids, and sends no OAuth', async () => {
  const ids = await fetchTraktTrending('tv', { clientId: 'test', fetchImpl: async (url, options) => {
    assert.match(url, /shows\/trending\?limit=50/);
    assert.equal(options.headers.Authorization, undefined);
    assert.ok(options.signal);
    return { ok: true, json: async () => [
      { show: { ids: { tmdb: 30 } } },
      { show: { ids: { tmdb: 10 } } },
      { show: { ids: { tmdb: 30 } } },
      { show: { ids: {} } },
      { show: { ids: { tmdb: 20 } } },
    ] };
  } });
  assert.deepEqual(ids, [30, 10, 20]);
});

test('missing configuration, HTTP errors and timeouts fall back to TMDb only', async () => {
  assert.deepEqual(await fetchTraktTrending('movie', { clientId: '', fetchImpl: () => { throw Error('must not call'); } }), []);
  for (const fetchImpl of [async () => ({ ok: false }), async () => { throw Error('timeout'); }]) {
    assert.deepEqual(await fetchTraktTrending('movie', { clientId: 'test', fetchImpl }), []);
  }
});

test('Trakt order first, then the TMDb trending titles it lacks; only unknown ids are hydrated', async () => {
  const card = (tmdbId) => ({ tmdbId, mediaType: 'movie', title: `T${tmdbId}` });
  const hydrated = [];
  const merged = await mergeTrendingCandidates([3, 1, 9, 8], [card(1), card(2), card(3), card(4)], async (id) => {
    hydrated.push(id);
    if (id === 8) throw Error('unavailable');
    return card(id);
  });
  assert.deepEqual(merged.map((c) => c.tmdbId), [3, 1, 9, 2, 4]);
  assert.deepEqual(hydrated.sort(), [8, 9]);
});
