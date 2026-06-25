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

// ─── Filtros de calidad ───────────────────────────────────────────────────────
// Piso de votos por tipo para las listas amplias (trending/popular/top_rated/
// region_top): descartamos solo lo MUY desconocido (poco representativo) sin
// matar estrenos populares recientes (que aún acumulan votos). Las filas
// "curadas" (géneros, décadas, aclamadas, taquillazos…) usan umbrales más
// altos definidos abajo. TV acumula menos votos que cine.
const MIN_VOTES = { movie: 80, tv: 40 };

// Umbrales de vote_count por tipo para cada categoría discover.
const GENRE_VOTES = { movie: 500, tv: 150 };
const DECADE_VOTES = { movie: 800, tv: 150 };
const ACCLAIMED_VOTES = { movie: 3000, tv: 400 };
const BLOCKBUSTER_VOTES = { movie: 5000, tv: 800 };
const GEM_VOTES = {
  movie: { gte: 800, lte: 6000 },
  tv: { gte: 300, lte: 2500 },
};

// Dedup + filtra por piso de votos (descarta lo poco representativo).
function refine(cards, mediaType, floor) {
  const min = floor ?? MIN_VOTES[mediaType] ?? 0;
  return dedupeCards(cards).filter((c) => (c?.voteCount || 0) >= min);
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
    refine(await tmdbList({ path: `/trending/${mediaType}/week`, mediaType, pages: 4 }), mediaType)
  );
}

// popular (24h) — pool profundo: trending/region_top/popular se solapan mucho,
// así que necesitamos suficientes títulos únicos para que tras la deduplicación
// "Populares" conserve >= 15 elementos.
for (const mediaType of ['movie', 'tv']) {
  addPool('popular', mediaType, TTL_24H, async () =>
    refine(await tmdbList({ path: `/${mediaType}/popular`, mediaType, pages: 7 }), mediaType)
  );
}

// top_rated (7d)
for (const mediaType of ['movie', 'tv']) {
  addPool('top_rated', mediaType, TTL_7D, async () =>
    refine(await tmdbList({ path: `/${mediaType}/top_rated`, mediaType, pages: 3 }), mediaType)
  );
}

// acclaimed (7d) — vote_average alto + muchos votos
for (const mediaType of ['movie', 'tv']) {
  addPool('acclaimed', mediaType, TTL_7D, async () =>
    refine(await discoverPages(mediaType, {
      sort_by: 'vote_average.desc',
      'vote_average.gte': 7.5,
      'vote_count.gte': ACCLAIMED_VOTES[mediaType],
    }, 3), mediaType, ACCLAIMED_VOTES[mediaType])
  );
}

// blockbusters (7d) — populares con muchísimos votos
for (const mediaType of ['movie', 'tv']) {
  addPool('blockbusters', mediaType, TTL_7D, async () =>
    refine(await discoverPages(mediaType, {
      sort_by: 'popularity.desc',
      'vote_count.gte': BLOCKBUSTER_VOTES[mediaType],
    }, 3), mediaType, BLOCKBUSTER_VOTES[mediaType])
  );
}

// hidden_gems (7d) — bien valoradas con votos suficientes pero no masivos
for (const mediaType of ['movie', 'tv']) {
  addPool('hidden_gems', mediaType, TTL_7D, async () =>
    refine(await discoverPages(mediaType, {
      sort_by: 'vote_average.desc',
      'vote_average.gte': 7.5,
      'vote_count.gte': GEM_VOTES[mediaType].gte,
      'vote_count.lte': GEM_VOTES[mediaType].lte,
    }, 3), mediaType, GEM_VOTES[mediaType].gte)
  );
}

// new_releases (24h) — contenido nuevo (por su naturaleza tiene pocos votos:
// NO se aplica el piso de votos; ordenamos por popularidad para los más sonados)
addPool('new_releases', 'movie', TTL_24H, async () =>
  dedupeCards(await tmdbList({ path: '/movie/upcoming', mediaType: 'movie', pages: 3 }))
);
addPool('new_releases', 'tv', TTL_24H, async () =>
  dedupeCards(await tmdbList({ path: '/tv/on_the_air', mediaType: 'tv', pages: 3 }))
);

// region_top (24h) — populares en ES con votos suficientes
addPool('region_top', 'movie', TTL_24H, async () =>
  refine(await discoverPages('movie', {
    region: 'ES',
    sort_by: 'popularity.desc',
    'vote_count.gte': MIN_VOTES.movie,
  }, 4), 'movie')
);
addPool('region_top', 'tv', TTL_24H, async () =>
  refine(await discoverPages('tv', {
    region: 'ES',
    sort_by: 'popularity.desc',
    'vote_count.gte': MIN_VOTES.tv,
  }, 4), 'tv')
);

// genre pools (7d) — por género en MOVIE_GENRES y TV_GENRES
for (const { id } of MOVIE_GENRES) {
  const poolKey = `genre:${id}`;
  addPool(poolKey, 'movie', TTL_7D, async () =>
    refine(await discoverPages('movie', {
      with_genres: id,
      sort_by: 'popularity.desc',
      'vote_count.gte': GENRE_VOTES.movie,
    }, 3), 'movie', GENRE_VOTES.movie)
  );
}
for (const { id } of TV_GENRES) {
  const poolKey = `genre:${id}`;
  addPool(poolKey, 'tv', TTL_7D, async () =>
    refine(await discoverPages('tv', {
      with_genres: id,
      sort_by: 'popularity.desc',
      'vote_count.gte': GENRE_VOTES.tv,
    }, 3), 'tv', GENRE_VOTES.tv)
  );
}

// decade pools (30d) — 1980, 1990, 2000, 2010, 2020 × movie + tv
const DECADES = [1980, 1990, 2000, 2010, 2020];
for (const year of DECADES) {
  const poolKey = `decade:${year}`;
  const dateGte = `${year}-01-01`;
  const dateLte = `${year + 9}-12-31`;

  // Pool profundo (5 págs): las décadas recientes (2010/2020) se solapan mucho
  // con tendencias/populares/géneros, así que necesitan títulos suficientes para
  // que tras la deduplicación conserven >= 15 elementos.
  addPool(poolKey, 'movie', TTL_30D, async () =>
    refine(await discoverPages('movie', {
      'primary_release_date.gte': dateGte,
      'primary_release_date.lte': dateLte,
      sort_by: 'popularity.desc',
      'vote_count.gte': DECADE_VOTES.movie,
    }, 5), 'movie', DECADE_VOTES.movie)
  );

  addPool(poolKey, 'tv', TTL_30D, async () =>
    refine(await discoverPages('tv', {
      'first_air_date.gte': dateGte,
      'first_air_date.lte': dateLte,
      sort_by: 'popularity.desc',
      'vote_count.gte': DECADE_VOTES.tv,
    }, 5), 'tv', DECADE_VOTES.tv)
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
