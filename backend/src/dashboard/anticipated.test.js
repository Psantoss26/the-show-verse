import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAnticipated, mergeAnticipatedCandidates } from './anticipated.js';
import { rankAnticipatedTitles } from './score.js';

test('public demand accepts valid IDs/counts, removes duplicates and sends no OAuth', async () => {
  const rows = await fetchAnticipated('movie', { clientId: 'test', fetchImpl: async (url, options) => {
    assert.match(url, /movies\/anticipated/);
    assert.equal(options.headers.Authorization, undefined);
    assert.ok(options.signal);
    return { ok: true, json: async () => [
      { movie: { ids: { tmdb: 1 } }, list_count: 42000 },
      { movie: { ids: { tmdb: 1 } }, list_count: 42000 },
      { movie: { ids: {} }, list_count: 5000 },
      { movie: { ids: { tmdb: 2 } }, list_count: -1 },
    ] };
  } });
  assert.deepEqual(rows, [{ tmdbId: 1, mediaType: 'movie', anticipatedListCount: 42000 }]);
});

test('missing configuration, HTTP errors and timeouts leave TMDb fallback available', async () => {
  assert.deepEqual(await fetchAnticipated('tv', { clientId: '', fetchImpl: () => { throw Error('must not call'); } }), []);
  for (const fetchImpl of [async () => ({ ok: false }), async () => { throw Error('timeout'); }]) {
    assert.deepEqual(await fetchAnticipated('tv', { clientId: 'test', fetchImpl }), []);
  }
});

test('missing blockbuster candidates are hydrated, ranked above spikes, and failures are isolated', async () => {
  const card = (tmdbId, extra = {}) => ({ tmdbId, mediaType: 'movie', releaseDate: '2027-03-01', popularity: 10, ...extra });
  const requested = [];
  const merged = await mergeAnticipatedCandidates([card(1, { popularity: 1000 })], [
    { tmdbId: 1, anticipatedListCount: 2000 },
    { tmdbId: 2, anticipatedListCount: 42000 },
    { tmdbId: 3, anticipatedListCount: 1000 },
  ], async (id) => { requested.push(id); if (id === 3) throw Error('unavailable'); return card(id); });
  assert.deepEqual(requested.sort(), [2, 3]);
  assert.deepEqual(rankAnticipatedTitles(merged, { now: '2026-10-11' }).map(c => c.tmdbId), [2, 1]);
});

test('fallback does not mistake pre-release votes for anticipation', () => {
  const base = { tmdbId: 1, mediaType: 'movie', popularity: 100, releaseDate: '2027-01-01' };
  const ranked = rankAnticipatedTitles([base, { ...base, tmdbId: 2, voteCount: 10000 }], { now: '2026-10-11' });
  assert.equal(ranked[0].anticipatedScore, ranked[1].anticipatedScore);
});
