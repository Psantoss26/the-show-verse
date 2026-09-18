import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';

const source = await readFile(new URL('../../../public/sw.js', import.meta.url), 'utf8');
const origin = 'https://app.test';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function harness() {
  const stores = new Map();
  const listeners = {};
  const messages = [];
  const key = (request) => typeof request === 'string' ? new URL(request, origin).href : request.url;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async match(request) { return store.get(key(request))?.clone(); },
        async put(request, response) { store.set(key(request), response.clone()); },
        async keys() { return [...store.keys()].map((url) => new Request(url)); },
      };
    },
    async match(request) { for (const store of stores.values()) { const found = store.get(key(request)); if (found) return found.clone(); } },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  let handler = () => json({ ok: true });
  const context = vm.createContext({
    URL, URLSearchParams, Request, Response, Headers, TextEncoder, Uint8Array,
    crypto: webcrypto, AbortController, setTimeout, clearTimeout, console, caches,
    fetch: async (request) => handler(request),
    self: { location: { href: `${origin}/sw.js?v=build-a`, origin }, skipWaiting: async () => {},
      clients: { claim: async () => {}, matchAll: async () => [{ postMessage: (message) => messages.push(message) }] },
      addEventListener: (name, fn) => { listeners[name] = fn; },
    },
  });
  vm.runInContext(source, context);
  return {
    context, caches, stores, messages,
    network(fn) { handler = fn; },
    async online() { await context.connectivity(true); },
    async login(id) { await context.changeOwner(id); },
    async read(path, init = {}) { return context.apiRead(new Request(`${origin}${path}`, init)); },
    async navigate(path) { return context.navigation(new Request(`${origin}${path}`, { headers: { Accept: 'text/html' } })); },
    async message(data) { let pending; let result; listeners.message({ data, ports: [{ postMessage: (value) => { result = value; } }], waitUntil: (promise) => { pending = promise; } }); await pending; return result; },
    async fetch(path, init) { let response; listeners.fetch({ request: new Request(`${origin}${path}`, init), respondWith: (promise) => { response = promise; } }); return response; },
  };
}

test('NAS 503 preserves complete API snapshot; successful online reads always win', async () => {
  const sw = harness(); await sw.login('alice');
  sw.network(() => json({ items: [{ id: 42, favorite: true, rating: 8 }] }));
  await sw.read('/api/favorites?b=2&a=1');
  sw.network(() => new Response('<html>Cloudflare</html>', { status: 503 }));
  const offline = await sw.read('/api/favorites?a=1&b=2');
  assert.equal(offline.status, 200);
  assert.equal(offline.headers.get('X-Showverse-Offline'), '1');
  assert.equal((await offline.json()).items[0].rating, 8);
  await sw.online(); sw.network(() => json({ items: [] }));
  assert.deepEqual(await (await sw.read('/api/favorites?a=1&b=2')).json(), { items: [] });
});

test('authentication errors do not expose stale private responses', async () => {
  const sw = harness(); await sw.login('alice');
  sw.network(() => json({ private: true })); await sw.read('/api/favorites');
  sw.network(() => json({ error: 'Unauthorized' }, 401));
  assert.equal((await sw.read('/api/favorites')).status, 401);
});

test('logout / account switch clears private data and in-flight old responses', async () => {
  const sw = harness(); await sw.login('alice');
  let resolve;
  sw.network(() => new Promise((done) => { resolve = done; }));
  const request = sw.read('/api/favorites');
  while (!resolve) await new Promise((done) => setImmediate(done));
  await sw.login('bob'); resolve(json({ secret: 'alice' })); await request;
  sw.network(() => { throw new Error('offline'); });
  assert.equal((await sw.read('/api/favorites')).status, 503);
  assert.equal((await sw.message({ type: 'OFFLINE_STATUS' })).owner, 'bob');
});

test('private POST state reads work offline across different batches', async () => {
  const sw = harness(); await sw.login('alice');
  sw.network(() => json({ states: { 'movie:1': { favorite: true, rating: 9 }, 'tv:2': { watched: true } } }));
  const init = (items) => ({ method: 'POST', body: JSON.stringify({ items }) });
  await sw.read('/api/backend/items/states', init([{ mediaType: 'movie', tmdbId: 1 }, { mediaType: 'tv', tmdbId: 2 }]));
  sw.network(() => { throw new Error('offline'); });
  const response = await sw.read('/api/backend/items/states', init([{ mediaType: 'tv', tmdbId: 2 }]));
  assert.deepEqual(await response.json(), { states: { 'tv:2': { watched: true } } });
});

test('full profile collection supports unseen pagination and follower shape', async () => {
  const sw = harness(); await sw.login('alice');
  const items = Array.from({ length: 140 }, (_, id) => ({ id }));
  await sw.message({ type: 'OFFLINE_COLLECTION', owner: 'alice', path: '/api/users/alice/favorites', items });
  await sw.message({ type: 'OFFLINE_COLLECTION', owner: 'alice', path: '/api/users/alice/followers', items });
  sw.network(() => { throw new Error('offline'); });
  const result = await (await sw.read('/api/users/alice/favorites?limit=20&offset=120')).json();
  assert.equal(result.items.length, 20); assert.equal(result.items[0].id, 120); assert.equal(result.hasMore, false);
  const followers = await (await sw.read('/api/users/alice/followers?limit=5&offset=0')).json();
  assert.equal(followers.users.length, 5);
});

test('navigation keeps the actual title document, not a home shell at a different URL', async () => {
  const sw = harness(); await sw.login('alice');
  sw.network(() => new Response('<html>Movie 42</html>', { headers: { 'Content-Type': 'text/html' } }));
  await sw.navigate('/details/movie/42');
  sw.network(() => new Response('NAS down', { status: 502 }));
  assert.match(await (await sw.navigate('/details/movie/42')).text(), /Movie 42/);
  assert.equal((await sw.navigate('/details/movie/99')).status, 503);
});

test('mutations are rejected offline without a network write or queue', async () => {
  const sw = harness(); await sw.login('alice'); await sw.context.connectivity(false);
  let writes = 0; sw.network(() => { writes++; return json({ ok: true }); });
  const response = await sw.fetch('/api/trakt/ratings', { method: 'POST', body: '{"rating":1}' });
  assert.equal(response.status, 503); assert.equal(writes, 0);
});

test('HTML masquerading as a successful API response cannot erase saved auth', async () => {
  const sw = harness(); await sw.login('alice');
  sw.network(() => json({ authenticated: true, user: { id: 'alice' } })); await sw.read('/api/auth/me');
  sw.network(() => new Response('<html>proxy error</html>', { headers: { 'Content-Type': 'text/html' } }));
  assert.equal((await (await sw.read('/api/auth/me')).json()).user.id, 'alice');
});

test('RSC response is never replayed into a different router tree', async () => {
  const sw = harness(); await sw.context.connectivity(false);
  const response = await sw.fetch('/details/movie/42?_rsc=random', { headers: { RSC: '1' } });
  assert.equal(response.type, 'error');
});

test('saved full history serves unseen pages and filters without inventing an empty list', async () => {
  const sw = harness(); await sw.login('alice');
  const items = Array.from({ length: 201 }, (_, id) => ({ id, tmdbId: id, type: id % 2 ? 'movie' : 'show', watched_at: '2026-09-18T12:00:00Z' }));
  sw.network(() => json({ connected: true, items, pagination: { hasMore: false } }));
  await sw.read('/api/trakt/history?type=all&page=1&limit=all&extended=full&enrich=1');
  sw.network(() => new Response('NAS unavailable', { status: 502 }));
  const result = await (await sw.read('/api/trakt/history?type=all&page=2&limit=100&extended=full&enrich=0')).json();
  assert.equal(result.items.length, 100); assert.equal(result.items[0].id, 100); assert.equal(result.pagination.hasMore, true);
  const movies = await (await sw.read('/api/trakt/history?type=movies&limit=all')).json();
  assert.equal(movies.items.length, 100); assert.equal(movies.items[0].type, 'movie');
});

test('a broken integration does not put a healthy app in global offline mode', async () => {
  const sw = harness();
  sw.network((request) => new URL(request.url).pathname === '/api/health' ? json({ok:true}) : json({error:'upstream'}, 503));
  await sw.read('/api/soundtrack');
  assert.equal((await sw.message({type:'OFFLINE_STATUS'})).online, true);
});
