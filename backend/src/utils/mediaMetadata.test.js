import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveMediaMetadata,
  USER_LIST_METADATA_MAX_AGE_MS,
  USER_LIST_METADATA_REFRESH_BUDGET_MS,
} from './mediaMetadata.js';

// Caso real: Rafa (tv:279884) quedó en `tmdb_cache` el 2026-06-20 con 9,111
// (18 votos) y Pendientes la agrupaba en 9–9,5; TMDb da hoy 8,36 (50 votos).
const NOW = Date.parse('2026-11-27T12:00:00Z');
const RAFA = { mediaType: 'tv', tmdbId: 279884 };
const staleRafaHit = {
  cacheKey: 'tmdb:tv:279884',
  data: { name: 'Rafa', vote_average: 9.111, vote_count: 18 },
  fetchedAt: '2026-06-20T13:10:45Z',
};
const userListOptions = {
  maxAgeMs: USER_LIST_METADATA_MAX_AGE_MS,
  refreshBudgetMs: USER_LIST_METADATA_REFRESH_BUDGET_MS,
};

function deps({ hits = [], fetchMetadata, now = NOW } = {}) {
  const writes = [];
  const fetches = [];
  return {
    writes,
    fetches,
    deps: {
      now: () => now,
      readCache: async () => hits,
      fetchMetadata: async (type, id) => {
        fetches.push(`${type}:${id}`);
        return fetchMetadata ? fetchMetadata(type, id) : null;
      },
      writeCache: async (type, id, data) => writes.push({ key: `${type}:${id}`, data }),
    },
  };
}

test('Rafa: una copia caducada se vuelve a pedir y gana la nota actual', async () => {
  const d = deps({
    hits: [staleRafaHit],
    fetchMetadata: async () => ({ name: 'Rafa', vote_average: 8.36, vote_count: 50 }),
  });
  const map = await resolveMediaMetadata([RAFA], userListOptions, d.deps);
  assert.equal(map.get('tv:279884').vote_average, 8.36);
  assert.deepEqual(d.fetches, ['tv:279884']);
  assert.equal(d.writes[0].data.vote_average, 8.36);
});

test('sin maxAgeMs se mantiene el comportamiento antiguo (cualquier copia vale)', async () => {
  const d = deps({ hits: [staleRafaHit], fetchMetadata: async () => ({ vote_average: 8.36 }) });
  const map = await resolveMediaMetadata([RAFA], {}, d.deps);
  assert.equal(map.get('tv:279884').vote_average, 9.111);
  assert.deepEqual(d.fetches, []);
});

test('una copia reciente no se vuelve a pedir', async () => {
  const fresh = { ...staleRafaHit, fetchedAt: new Date(NOW - 60 * 60 * 1000).toISOString(), data: { vote_average: 8.36 } };
  const d = deps({ hits: [fresh] });
  const map = await resolveMediaMetadata([RAFA], userListOptions, d.deps);
  assert.equal(map.get('tv:279884').vote_average, 8.36);
  assert.deepEqual(d.fetches, []);
});

test('entre varias claves de la misma ficha gana la más reciente', async () => {
  const d = deps({
    hits: [
      staleRafaHit,
      { cacheKey: 'bare:tv:279884', data: { vote_average: 8.4 }, fetchedAt: new Date(NOW - 1000).toISOString() },
    ],
  });
  const map = await resolveMediaMetadata([RAFA], userListOptions, d.deps);
  assert.equal(map.get('tv:279884').vote_average, 8.4);
  assert.deepEqual(d.fetches, []);
});

test('si TMDb falla, se conserva la copia vieja en vez de perder el título', async () => {
  const d = deps({ hits: [staleRafaHit], fetchMetadata: async () => { throw new Error('down'); } });
  const map = await resolveMediaMetadata([RAFA], userListOptions, d.deps);
  assert.equal(map.get('tv:279884').vote_average, 9.111);
});

test('el refresco de copias caducadas no pasa del plazo y termina en segundo plano', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const d = deps({
    hits: [staleRafaHit],
    fetchMetadata: async () => { await gate; return { vote_average: 8.36 }; },
  });
  const started = Date.now();
  const map = await resolveMediaMetadata([RAFA], { ...userListOptions, refreshBudgetMs: 30 }, d.deps);
  assert.ok(Date.now() - started < 1000);
  assert.equal(map.get('tv:279884').vote_average, 9.111);
  release();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(d.writes[0]?.data.vote_average, 8.36);
});

test('un título sin copia en caché se espera entero aunque haya plazo', async () => {
  const d = deps({
    fetchMetadata: async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return { vote_average: 7.2 };
    },
  });
  const map = await resolveMediaMetadata([{ mediaType: 'movie', tmdbId: 1 }], { ...userListOptions, refreshBudgetMs: 10 }, d.deps);
  assert.equal(map.get('movie:1').vote_average, 7.2);
});

test('respeta la concurrencia al refrescar muchas fichas', async () => {
  let active = 0;
  let peak = 0;
  const rows = Array.from({ length: 30 }, (_, i) => ({ mediaType: 'movie', tmdbId: i + 1 }));
  const d = deps({
    fetchMetadata: async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return { vote_average: 7 };
    },
  });
  const map = await resolveMediaMetadata(rows, { ...userListOptions, refreshConcurrency: 4 }, d.deps);
  assert.equal(map.size, 30);
  assert.ok(peak <= 4, `pico ${peak}`);
});
