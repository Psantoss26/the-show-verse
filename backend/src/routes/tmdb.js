// src/routes/tmdb.js
// Proxy de TMDb con caché Redis + PostgreSQL
// Reemplaza las llamadas directas a TMDb desde el frontend y elimina la dependencia de JustWatch

import { and, eq, gt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { tmdbCache } from '../db/schema.js';
import { cacheGet, cacheSet } from '../lib/redis.js';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = 'https://api.themoviedb.org/3';

const TTL = {
  details: Number(process.env.CACHE_TTL_TMDB_DETAILS) || 600,     // 10 min
  trending: Number(process.env.CACHE_TTL_TMDB_TRENDING) || 300,   // 5 min
  person: 3600,         // 1 hora
  providers: Number(process.env.CACHE_TTL_PROVIDERS) || 3600,     // 1 hora
  search: 120,          // 2 min
  discover: 300,        // 5 min
};

async function tmdbFetch(path, params = {}) {
  if (!TMDB_API_KEY) throw new Error('TMDB_API_KEY not configured');

  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set('api_key', TMDB_API_KEY);
  if (!params.language) url.searchParams.set('language', 'es-ES');

  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err.status_message || `TMDb ${res.status}`), { status: res.status });
  }

  return res.json();
}

async function getDbCache(cacheKey) {
  const [hit] = await db
    .select({ data: tmdbCache.data, expiresAt: tmdbCache.expiresAt })
    .from(tmdbCache)
    .where(andCacheKeyFresh(cacheKey))
    .limit(1);

  return hit?.data ?? null;
}

function andCacheKeyFresh(cacheKey) {
  return and(eq(tmdbCache.cacheKey, cacheKey), gt(tmdbCache.expiresAt, new Date()));
}

async function setDbCache(cacheKey, data, ttlSeconds) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  await db
    .insert(tmdbCache)
    .values({
      cacheKey,
      data,
      fetchedAt: now,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: tmdbCache.cacheKey,
      set: {
        data,
        fetchedAt: now,
        expiresAt,
      },
    });
}

async function withPersistentTmdbCache(cacheKey, ttlSeconds, fetchFn) {
  const redisHit = await cacheGet(cacheKey);
  if (redisHit !== null) return redisHit;

  const dbHit = await getDbCache(cacheKey).catch(() => null);
  if (dbHit !== null) {
    await cacheSet(cacheKey, dbHit, ttlSeconds);
    return dbHit;
  }

  const value = await fetchFn();
  if (value !== null && value !== undefined) {
    await Promise.allSettled([
      cacheSet(cacheKey, value, ttlSeconds),
      setDbCache(cacheKey, value, ttlSeconds),
    ]);
  }

  return value;
}

export default async function tmdbRoutes(fastify) {
  // ──────────────────────────────────────────────
  // GET /tmdb/movie/:id
  // ──────────────────────────────────────────────
  fastify.get('/movie/:id', async (req, reply) => {
    const { id } = req.params;
    const data = await withPersistentTmdbCache(`tmdb:movie:${id}`, TTL.details, () =>
      tmdbFetch(`/movie/${id}`, {
        append_to_response: 'external_ids,credits,videos,images,recommendations,watch/providers',
        include_image_language: 'es,en,null',
      })
    );
    if (!data) return reply.status(404).send({ error: 'Not found' });
    return reply.send(data);
  });

  // ──────────────────────────────────────────────
  // GET /tmdb/tv/:id
  // ──────────────────────────────────────────────
  fastify.get('/tv/:id', async (req, reply) => {
    const { id } = req.params;
    const data = await withPersistentTmdbCache(`tmdb:tv:${id}`, TTL.details, () =>
      tmdbFetch(`/tv/${id}`, {
        append_to_response: 'external_ids,credits,videos,images,recommendations,watch/providers',
        include_image_language: 'es,en,null',
      })
    );
    if (!data) return reply.status(404).send({ error: 'Not found' });
    return reply.send(data);
  });

  // ──────────────────────────────────────────────
  // GET /tmdb/person/:id
  // ──────────────────────────────────────────────
  fastify.get('/person/:id', async (req, reply) => {
    const { id } = req.params;
    const data = await withPersistentTmdbCache(`tmdb:person:${id}`, TTL.person, () =>
      tmdbFetch(`/person/${id}`, {
        append_to_response: 'combined_credits,external_ids,images',
      })
    );
    if (!data) return reply.status(404).send({ error: 'Not found' });
    return reply.send(data);
  });

  // ──────────────────────────────────────────────
  // GET /tmdb/search?q=&type=&page=
  // ──────────────────────────────────────────────
  fastify.get('/search', async (req, reply) => {
    const { q, type = 'multi', page = 1 } = req.query;
    if (!q) return reply.status(400).send({ error: 'q param required' });

    const endpoint = type === 'multi' ? '/search/multi'
      : type === 'movie' ? '/search/movie'
      : type === 'tv' ? '/search/tv'
      : '/search/person';

    const cacheKey = `tmdb:search:${endpoint}:${q}:${page}`;
    const data = await withPersistentTmdbCache(cacheKey, TTL.search, () =>
      tmdbFetch(endpoint, { query: q, page })
    );

    return reply.send(data || { results: [] });
  });

  // ──────────────────────────────────────────────
  // GET /tmdb/discover/movies
  // ──────────────────────────────────────────────
  fastify.get('/discover/movies', async (req, reply) => {
    const params = req.query;
    const cacheKey = `tmdb:discover:movie:${JSON.stringify(params)}`;
    const data = await withPersistentTmdbCache(cacheKey, TTL.discover, () =>
      tmdbFetch('/discover/movie', params)
    );
    return reply.send(data || { results: [] });
  });

  // ──────────────────────────────────────────────
  // GET /tmdb/discover/tv
  // ──────────────────────────────────────────────
  fastify.get('/discover/tv', async (req, reply) => {
    const params = req.query;
    const cacheKey = `tmdb:discover:tv:${JSON.stringify(params)}`;
    const data = await withPersistentTmdbCache(cacheKey, TTL.discover, () =>
      tmdbFetch('/discover/tv', params)
    );
    return reply.send(data || { results: [] });
  });

  // ──────────────────────────────────────────────
  // GET /tmdb/trending?type=all|movie|tv&window=week|day
  // ──────────────────────────────────────────────
  fastify.get('/trending', async (req, reply) => {
    const { type = 'all', window = 'week' } = req.query;
    const cacheKey = `tmdb:trending:${type}:${window}`;
    const data = await withPersistentTmdbCache(cacheKey, TTL.trending, () =>
      tmdbFetch(`/trending/${type}/${window}`)
    );
    return reply.send(data || { results: [] });
  });

  // ──────────────────────────────────────────────
  // GET /tmdb/:type/:id/providers?region=ES
  // Reemplaza JustWatch — usa los datos oficiales de TMDb Watch Providers
  // ──────────────────────────────────────────────
  fastify.get('/:type/:id/providers', async (req, reply) => {
    const { type, id } = req.params;
    const { region = 'ES' } = req.query;

    if (!['movie', 'tv'].includes(type)) {
      return reply.status(400).send({ error: 'Invalid type' });
    }

    const cacheKey = `tmdb:providers:${type}:${id}:${region}`;
    const raw = await withPersistentTmdbCache(cacheKey, TTL.providers, () =>
      tmdbFetch(`/${type}/${id}/watch/providers`)
    );

    if (!raw) return reply.send({ providers: [], link: null });

    const country = raw.results?.[region] ?? raw.results?.US ?? Object.values(raw.results || {})[0];
    if (!country) return reply.send({ providers: [], link: null });

    const allProviders = [
      ...(country.flatrate || []).map(p => ({ ...p, type: 'flatrate' })),
      ...(country.rent || []).map(p => ({ ...p, type: 'rent' })),
      ...(country.buy || []).map(p => ({ ...p, type: 'buy' })),
      ...(country.free || []).map(p => ({ ...p, type: 'free' })),
      ...(country.ads || []).map(p => ({ ...p, type: 'ads' })),
    ];

    // Deduplicar por provider_id
    const byId = new Map();
    for (const p of allProviders) {
      if (!byId.has(p.provider_id)) byId.set(p.provider_id, p);
    }

    const providers = Array.from(byId.values()).sort(
      (a, b) => (a.display_priority ?? 9999) - (b.display_priority ?? 9999)
    );

    return reply.send({ providers, link: country.link || null });
  });
}
