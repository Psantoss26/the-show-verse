import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import dashboardRoutes from './dashboard.js';
import { stableHash } from '../dashboard/ranking.js';

const card = (id, mediaType, extra = {}) => ({ tmdbId: id, mediaType, title: `Title ${id}`, posterPath: '/poster.jpg',
  voteCount: 8000, voteAverage: 8, popularity: 100, genreIds: [18], ...extra });
const emptyLibrary = { favorites: [], ratings: [], history: [], watchlist: [] };
async function appFor({ lib = emptyLibrary, fail = false } = {}) {
  const app = Fastify();
  app.decorateRequest('user', null);
  app.addHook('preHandler', async req => { if (req.headers['x-test-user']) req.user = { id: req.headers['x-test-user'] }; });
  await app.register(dashboardRoutes, { prefix: '/dashboard', sources: {
    loadLibrary: async () => lib,
    getUserRecommendations: async (_, mt) => lib.favorites.length
      ? Array.from({ length: 160 }, (_, i) => card(i + 1, mt, { score: 100 / (1 + i / 30),
        reasons: [{ type: 'because', seedTmdbId: 900, seedMediaType: mt, seedTitle: 'Liked', strength: 10 }] })) : [],
    getPool: async (key, mt) => {
      if (fail && key === 'trending') throw new Error('source unavailable');
      const offset = stableHash(key) % 100000 + 1000;
      return [...Array.from({ length: 45 }, (_, i) => card(i + 1, mt)),
        ...Array.from({ length: 100 }, (_, i) => card(offset + i, mt))];
    },
  } });
  return app;
}
function verifyRows(body, surface) {
  assert.ok(body.rows.length >= 12, `${surface}: ${body.rows.length} rows`);
  const used = new Map();
  body.rows.forEach((row, index) => {
    assert.ok(row.items.length >= 12 && row.items.length <= 32);
    assert.equal(new Set(row.items.map(c => `${c.mediaType}:${c.tmdbId}`)).size, row.items.length);
    let repeats = 0;
    for (const c of row.items) {
      if (surface === 'movies') assert.equal(c.mediaType, 'movie');
      if (surface === 'series') assert.equal(c.mediaType, 'tv');
      const key = `${c.mediaType}:${c.tmdbId}`, prior = used.get(key) || [];
      if (prior.length) { repeats++; assert.ok(index - prior.at(-1) >= 3); }
      assert.ok(prior.length < 2);
      used.set(key, [...prior, index]);
    }
    assert.ok(repeats <= Math.floor(row.items.length * .125));
  });
}
for (const authenticated of [false, true]) {
  test(`all dashboards: representative volume, valid types, bounded duplicates (${authenticated ? 'personal' : 'anonymous'})`, async t => {
    const app = await appFor({ lib: authenticated ? { ...emptyLibrary, favorites: [{ tmdbId: 900, mediaType: 'movie' }],
      ratings: [{ tmdbId: 1, mediaType: 'movie', rating: 2 }, { tmdbId: 1, mediaType: 'tv', rating: 5 }] } : emptyLibrary });
    t.after(() => app.close());
    for (const surface of ['home', 'movies', 'series']) {
      const request = { url: `/dashboard/${surface}`, headers: authenticated ? { 'x-test-user': 'profile-a' } : {} };
      const response = await app.inject(request);
      assert.equal(response.statusCode, 200);
      const body = response.json();
      verifyRows(body, surface);
      assert.equal(body.personalized, authenticated);
      if (authenticated) assert.ok(body.rows.every(r => r.items.every(c => c.tmdbId !== 1)));
      assert.deepEqual(body.rows, (await app.inject(request)).json().rows);
      if (surface === 'home' && authenticated) assert.deepEqual(new Set(body.rows[0].items.map(c => c.mediaType)), new Set(['movie', 'tv']));
    }
  });
}
test('empty profiles and failed pools retain useful generic rows', async t => {
  const app = await appFor({ fail: true }); t.after(() => app.close());
  const body = (await app.inject({ url: '/dashboard/home', headers: { 'x-test-user': 'new' } })).json();
  assert.equal(body.personalized, false);
  assert.ok(!body.rows.some(r => r.key === 'trending'));
  verifyRows(body, 'home');
  assert.equal((await app.inject('/dashboard/invalid')).statusCode, 404);
});
