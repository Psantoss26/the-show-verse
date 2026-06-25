// backend/src/dashboard/pools.js
import { db } from '../db/client.js';
import { dashboardPools } from '../db/schema.js';
import { and, eq } from 'drizzle-orm';
import { tmdbDiscover, tmdbList, MOVIE_GENRES, TV_GENRES } from './tmdb.js';

// ─── TTLs (ms) ────────────────────────────────────────────────────────────────
const TTL_12H  = 12 * 60 * 60 * 1000;
const TTL_24H  = 24 * 60 * 60 * 1000;
const TTL_7D   =  7 * 24 * 60 * 60 * 1000;
const TTL_30D  = 30 * 24 * 60 * 60 * 1000;

// ─── dedupeCards ──────────────────────────────────────────────────────────────
export function dedupeCards(cards) {
  const seen = new Set();
  const out = [];
  for (const c of cards || []) {
    if (!c) continue;
    const k = `${c.mediaType}:${c.tmdbId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

// ─── Helper: discover across N pages ─────────────────────────────────────────
async function discoverPages(mediaType, params, pages) {
  const all = [];
  for (let page = 1; page <= pages; page++) {
    const cards = await tmdbDiscover({ mediaType, params: { ...params, page } });
    all.push(...cards);
  }
  return all;
}

// ─── POOL_DEFS ────────────────────────────────────────────────────────────────
// Map keyed by `${poolKey}:${mediaType}`
export const POOL_DEFS = new Map();

function addPool(poolKey, mediaType, ttlMs, build) {
  POOL_DEFS.set(`${poolKey}:${mediaType}`, { poolKey, mediaType, ttlMs, build });
}

// trending (12h)
for (const mediaType of ['movie', 'tv']) {
  addPool('trending', mediaType, TTL_12H, async () =>
    dedupeCards(await tmdbList({ path: `/trending/${mediaType}/week`, mediaType, pages: 2 }))
  );
}

// popular (24h)
for (const mediaType of ['movie', 'tv']) {
  addPool('popular', mediaType, TTL_24H, async () =>
    dedupeCards(await tmdbList({ path: `/${mediaType}/popular`, mediaType, pages: 3 }))
  );
}

// top_rated (7d)
for (const mediaType of ['movie', 'tv']) {
  addPool('top_rated', mediaType, TTL_7D, async () =>
    dedupeCards(await tmdbList({ path: `/${mediaType}/top_rated`, mediaType, pages: 3 }))
  );
}

// acclaimed (7d) — vote_average >= 7.5, vote_count >= 2000
for (const mediaType of ['movie', 'tv']) {
  addPool('acclaimed', mediaType, TTL_7D, async () =>
    dedupeCards(await discoverPages(mediaType, {
      sort_by: 'vote_average.desc',
      'vote_average.gte': 7.5,
      'vote_count.gte': 2000,
    }, 3))
  );
}

// blockbusters (7d) — popularity desc, vote_count >= 4000
for (const mediaType of ['movie', 'tv']) {
  addPool('blockbusters', mediaType, TTL_7D, async () =>
    dedupeCards(await discoverPages(mediaType, {
      sort_by: 'popularity.desc',
      'vote_count.gte': 4000,
    }, 3))
  );
}

// hidden_gems (7d) — vote_average >= 7.5, 500 <= vote_count <= 3000
for (const mediaType of ['movie', 'tv']) {
  addPool('hidden_gems', mediaType, TTL_7D, async () =>
    dedupeCards(await discoverPages(mediaType, {
      sort_by: 'vote_average.desc',
      'vote_average.gte': 7.5,
      'vote_count.gte': 500,
      'vote_count.lte': 3000,
    }, 3))
  );
}

// new_releases (24h)
addPool('new_releases', 'movie', TTL_24H, async () =>
  dedupeCards(await tmdbList({ path: '/movie/upcoming', mediaType: 'movie', pages: 2 }))
);
addPool('new_releases', 'tv', TTL_24H, async () =>
  dedupeCards(await tmdbList({ path: '/tv/on_the_air', mediaType: 'tv', pages: 2 }))
);

// region_top (24h) — region ES, popularity desc
addPool('region_top', 'movie', TTL_24H, async () =>
  dedupeCards(await discoverPages('movie', {
    region: 'ES',
    sort_by: 'popularity.desc',
  }, 2))
);
addPool('region_top', 'tv', TTL_24H, async () =>
  dedupeCards(await discoverPages('tv', {
    watch_region: 'ES',
    sort_by: 'popularity.desc',
  }, 2))
);

// genre pools (7d) — per genre in MOVIE_GENRES and TV_GENRES
for (const { id } of MOVIE_GENRES) {
  const poolKey = `genre:${id}`;
  addPool(poolKey, 'movie', TTL_7D, async () =>
    dedupeCards(await discoverPages('movie', {
      with_genres: id,
      sort_by: 'popularity.desc',
      'vote_count.gte': 300,
    }, 3))
  );
}
for (const { id } of TV_GENRES) {
  const poolKey = `genre:${id}`;
  addPool(poolKey, 'tv', TTL_7D, async () =>
    dedupeCards(await discoverPages('tv', {
      with_genres: id,
      sort_by: 'popularity.desc',
      'vote_count.gte': 300,
    }, 3))
  );
}

// decade pools (30d) — 1980, 1990, 2000, 2010, 2020 × movie + tv
const DECADES = [1980, 1990, 2000, 2010, 2020];
for (const year of DECADES) {
  const poolKey = `decade:${year}`;
  const dateGte = `${year}-01-01`;
  const dateLte = `${year + 9}-12-31`;

  addPool(poolKey, 'movie', TTL_30D, async () =>
    dedupeCards(await discoverPages('movie', {
      'primary_release_date.gte': dateGte,
      'primary_release_date.lte': dateLte,
      sort_by: 'popularity.desc',
      'vote_count.gte': 500,
    }, 2))
  );

  addPool(poolKey, 'tv', TTL_30D, async () =>
    dedupeCards(await discoverPages('tv', {
      'first_air_date.gte': dateGte,
      'first_air_date.lte': dateLte,
      sort_by: 'popularity.desc',
      'vote_count.gte': 500,
    }, 2))
  );
}

// ─── getPool ──────────────────────────────────────────────────────────────────
export async function getPool(poolKey, mediaType) {
  const defKey = `${poolKey}:${mediaType}`;
  const def = POOL_DEFS.get(defKey);
  if (!def) return [];

  // Try to read from DB
  const [row] = await db
    .select()
    .from(dashboardPools)
    .where(and(eq(dashboardPools.poolKey, poolKey), eq(dashboardPools.mediaType, mediaType)))
    .limit(1);

  // Return cached if still fresh
  if (row && row.expiresAt > new Date()) {
    return row.items;
  }

  // Rebuild
  try {
    const items = await def.build();
    const builtAt = new Date();
    const expiresAt = new Date(Date.now() + def.ttlMs);

    await db
      .insert(dashboardPools)
      .values({ poolKey, mediaType, items, builtAt, expiresAt })
      .onConflictDoUpdate({
        target: [dashboardPools.poolKey, dashboardPools.mediaType],
        set: { items, builtAt, expiresAt },
      });

    return items;
  } catch {
    // On error return stale data if available, else []
    return row ? row.items : [];
  }
}

// ─── refreshAllPools ──────────────────────────────────────────────────────────
export async function refreshAllPools() {
  let built = 0;

  // Fetch all current rows to check expiry
  const rows = await db.select().from(dashboardPools);
  const rowMap = new Map();
  for (const row of rows) {
    rowMap.set(`${row.poolKey}:${row.mediaType}`, row);
  }

  const now = new Date();
  for (const [key, def] of POOL_DEFS) {
    const row = rowMap.get(key);
    // Only rebuild if missing or expired
    if (!row || row.expiresAt <= now) {
      await getPool(def.poolKey, def.mediaType);
      built++;
    }
  }

  return { built };
}
