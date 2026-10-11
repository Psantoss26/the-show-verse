import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import dashboardRoutes from './dashboard.js';
import { stableHash } from '../dashboard/ranking.js';
import { rankAnticipatedTitles } from '../dashboard/score.js';

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
      if (fail && (key === 'trending' || key === 'trending_section')) throw new Error('source unavailable');
      const offset = stableHash(key) % 100000 + 1000;
      return [...Array.from({ length: 45 }, (_, i) => card(i + 1, mt)),
        ...Array.from({ length: 100 }, (_, i) => card(offset + i, mt))];
    },
  } });
  return app;
}
// En Inicio, las filas con página dedicada (Recomendaciones, Más esperadas y
// Tendencias) llevan los 60 primeros de su lista; el resto, hasta 32.
const SECTION_ROWS = new Set(['for_you', 'anticipated', 'trending']);
function verifyRows(body, surface) {
  assert.ok(body.rows.length >= 12, `${surface}: ${body.rows.length} rows`);
  const used = new Map();
  body.rows.forEach((row, index) => {
    const isSectionRow = surface === 'home' && SECTION_ROWS.has(row.key);
    const max = isSectionRow ? 60 : 32;
    assert.ok(row.items.length >= 12 && row.items.length <= max, `${row.key}: ${row.items.length}`);
    // Las filas de sección son su lista verbatim (ver el test de abajo, que
    // además exige que las demás no repitan sus títulos): no cuentan aquí.
    if (isSectionRow) return;
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

test('home delivers the demand ranking end to end, without alternating formats', async t => {
  const app = Fastify();
  t.after(() => app.close());
  const candidates = Array.from({ length: 40 }, (_, i) => card(i + 1, i < 25 ? 'movie' : 'tv', {
    releaseDate: '2027-03-01', anticipatedListCount: 50000 - i * 1000,
  }));
  const ranked = rankAnticipatedTitles(candidates, { now: '2026-10-11' });
  await app.register(dashboardRoutes, { prefix: '/dashboard', sources: {
    getPool: async (key, type) => key === 'anticipated' ? ranked.filter(c => c.mediaType === type) : [],
  } });
  const response = await app.inject('/dashboard/home');
  assert.equal(response.statusCode, 200);
  const row = response.json().rows.find(r => r.key === 'anticipated');
  // Los 40 candidatos caben en la fila (hasta 60), en el orden de demanda.
  assert.deepEqual(row.items.map(c => c.tmdbId), ranked.map(c => c.tmdbId));
  assert.equal(row.items.filter(c => c.mediaType === 'movie').length, 25);
});

// ─── Páginas dedicadas de sección (/dashboard/sections/:key) ──────────────────
// Mismos pools y criterio que las filas del dashboard, pero completas: sin el
// recorte a 32 de la fila ni la rotación diaria.
test('section anticipated: full global demand ranking, far beyond the 32 of the row', async t => {
  const app = Fastify();
  t.after(() => app.close());
  const candidates = Array.from({ length: 260 }, (_, i) => card(i + 1, i % 3 === 0 ? 'tv' : 'movie', {
    releaseDate: '2027-03-01', anticipatedListCount: 90000 - i * 300,
  }));
  const ranked = rankAnticipatedTitles(candidates, { now: '2026-10-11' });
  await app.register(dashboardRoutes, { prefix: '/dashboard', sources: {
    getPool: async (key, type) => key === 'anticipated' ? ranked.filter(c => c.mediaType === type) : [],
  } });
  const response = await app.inject('/dashboard/sections/anticipated');
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.items.length, 200);
  assert.deepEqual(body.items.map(c => c.tmdbId), ranked.slice(0, 200).map(c => c.tmdbId));
  assert.deepEqual(new Set(body.items.map(c => c.mediaType)), new Set(['movie', 'tv']));
});

test('section for_you (personal): every recommendation by score, without anything already seen, rated or favorited', async t => {
  const lib = {
    ...emptyLibrary,
    favorites: [{ tmdbId: 900, mediaType: 'movie' }, { tmdbId: 3, mediaType: 'movie' }],
    history: [{ tmdbId: 5, mediaType: 'movie' }, { tmdbId: 8, mediaType: 'tv' }],
    ratings: [{ tmdbId: 7, mediaType: 'tv', rating: 9 }, { tmdbId: 1, mediaType: 'movie', rating: 2 }],
  };
  const app = await appFor({ lib });
  t.after(() => app.close());
  const request = { url: '/dashboard/sections/for_you', headers: { 'x-test-user': 'profile-a' } };
  const response = await app.inject(request);
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.personalized, true);
  assert.equal(body.items.length, 200);
  const keys = body.items.map(c => `${c.mediaType}:${c.tmdbId}`);
  assert.equal(new Set(keys).size, keys.length);
  for (const seen of ['movie:900', 'movie:3', 'movie:5', 'tv:8', 'tv:7', 'movie:1']) {
    assert.ok(!keys.includes(seen), `${seen} ya está en la biblioteca`);
  }
  // Películas y series alternas, cada una en su orden de puntuación.
  assert.deepEqual(body.items.slice(0, 4).map(c => c.mediaType), ['movie', 'tv', 'movie', 'tv']);
  for (const type of ['movie', 'tv']) {
    const scores = body.items.filter(c => c.mediaType === type).map(c => c.score);
    assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  }
  // Orden fijo: sin rotación diaria.
  assert.deepEqual(keys, (await app.inject(request)).json().items.map(c => `${c.mediaType}:${c.tmdbId}`));
});

test('section for_you (anonymous): generic popular + top rated, also far beyond 32', async t => {
  const app = await appFor();
  t.after(() => app.close());
  const body = (await app.inject('/dashboard/sections/for_you')).json();
  assert.equal(body.personalized, false);
  assert.ok(body.items.length > 32 && body.items.length <= 200, `${body.items.length}`);
  const keys = body.items.map(c => `${c.mediaType}:${c.tmdbId}`);
  assert.equal(new Set(keys).size, keys.length);
});

test('unknown section key is a 404', async t => {
  const app = await appFor();
  t.after(() => app.close());
  assert.equal((await app.inject('/dashboard/sections/whatever')).statusCode, 404);
});

test('section trending: the same mixed list the home row shows', async t => {
  const app = await appFor();
  t.after(() => app.close());
  const body = (await app.inject('/dashboard/sections/trending')).json();
  assert.ok(body.items.length > 60 && body.items.length <= 200, `${body.items.length}`);
  assert.deepEqual(body.items.slice(0, 4).map(c => c.mediaType), ['movie', 'tv', 'movie', 'tv']);
});

for (const authenticated of [false, true]) {
  test(`home section rows = first 60 of their dedicated page, same order, not repeated elsewhere (${authenticated ? 'personal' : 'anonymous'})`, async t => {
    const lib = authenticated ? { ...emptyLibrary, favorites: [{ tmdbId: 900, mediaType: 'movie' }],
      history: [{ tmdbId: 5, mediaType: 'movie' }], ratings: [{ tmdbId: 7, mediaType: 'tv', rating: 9 }] } : emptyLibrary;
    const app = await appFor({ lib });
    t.after(() => app.close());
    const headers = authenticated ? { 'x-test-user': 'profile-a' } : {};
    const home = (await app.inject({ url: '/dashboard/home', headers })).json();
    const keysOf = items => items.map(c => `${c.mediaType}:${c.tmdbId}`);
    const expected = authenticated ? ['for_you', 'anticipated', 'trending'] : ['anticipated', 'trending'];
    const pinned = new Set();
    for (const key of expected) {
      const row = home.rows.find(r => r.key === key);
      assert.ok(row, `${key} row`);
      const page = (await app.inject({ url: `/dashboard/sections/${key}`, headers })).json();
      assert.equal(row.items.length, 60, key);
      assert.deepEqual(keysOf(row.items), keysOf(page.items).slice(0, 60), `${key}: same order as its page`);
      keysOf(row.items).forEach(k => pinned.add(k));
    }
    assert.equal(home.rows.some(r => r.key === 'for_you'), authenticated);
    for (const row of home.rows.filter(r => !expected.includes(r.key))) {
      assert.ok(row.items.every(c => !pinned.has(`${c.mediaType}:${c.tmdbId}`)), `${row.key} repeats a section title`);
      assert.ok(row.items.length <= 32);
    }
  });
}
