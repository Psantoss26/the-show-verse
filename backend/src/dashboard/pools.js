// backend/src/dashboard/pools.js
import { db } from '../db/client.js';
import { dashboardPools } from '../db/schema.js';
import { and, eq } from 'drizzle-orm';
import { tmdbDiscover, tmdbList, MOVIE_GENRES, TV_GENRES } from './tmdb.js';
import { balanceSoftLimitedContent, excludeKidsReality, capAsian, localePriorityWeight, TV_WITHOUT_GENRES } from './filters.js';

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

// Pisos de votos por sección, para afinar "lo conocido/representativo":
// - Tendencias: piso modesto (refleja lo que sube ahora sin colar basura).
// - Populares: piso alto (solo títulos populares realmente reconocibles).
// - Top en España: piso moderado (contenido reciente tiene menos votos).
const TRENDING_VOTES = { movie: 150, tv: 60 };
const POPULAR_VOTES = { movie: 500, tv: 200 };
const REGION_VOTES = { movie: 150, tv: 60 };
const CURATED_VOTES = {
  drama: { movie: 700, tv: 180 },
  actionAdventure: { movie: 900, tv: 220 },
  nostalgia: { movie: 1200, tv: 280 },
};

// Fecha YYYY-MM-DD desplazada `days` respecto a hoy (para ventanas de estrenos
// y de "lo reciente" del Top en España). Se recalcula en cada rebuild del pool.
function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Dedup + reglas de contenido (sin infantil/reality, anime/asiático no
// predominante) + piso de votos (descarta lo poco representativo).
function refine(cards, mediaType, floor) {
  const min = floor ?? MIN_VOTES[mediaType] ?? 0;
  const cleaned = excludeKidsReality(dedupeCards(cards)).filter(
    (c) => (c?.voteCount || 0) >= min,
  );
  return balanceSoftLimitedContent(capAsian(cleaned));
}

// Parámetros de discover por tipo: en TV excluimos géneros no deseados
// (infantil/reality/talk/news) ya en la propia petición.
function discoverParams(mediaType, params) {
  return mediaType === 'tv'
    ? { without_genres: TV_WITHOUT_GENRES, ...params }
    : params;
}

// ─── Helper: discover across N pages ─────────────────────────────────────────
async function discoverPages(mediaType, params, pages) {
  // Páginas en paralelo (antes en serie): construir un pool baja de N×latencia
  // a ~1×latencia. Es un único pool, así que la concurrencia con TMDB es acotada.
  const results = await Promise.all(
    Array.from({ length: pages }, (_, i) =>
      tmdbDiscover({ mediaType, params: { ...params, page: i + 1 } }).catch(() => []),
    ),
  );
  return results.flat();
}

// ─── POOL_DEFS ────────────────────────────────────────────────────────────────
// Map keyed by `${poolKey}:${mediaType}`
export const POOL_DEFS = new Map();

function addPool(poolKey, mediaType, ttlMs, build) {
  POOL_DEFS.set(`${poolKey}:${mediaType}`, { poolKey, mediaType, ttlMs, build });
}

// trending (12h) — pool profundo (5 págs): las tendencias de TV en TMDB traen
// mucho anime/reality; tras filtrar contenido y limitar el asiático necesitamos
// margen para conservar >= 15 tras la deduplicación cruzada.
for (const mediaType of ['movie', 'tv']) {
  addPool('trending', mediaType, TTL_12H, async () =>
    refine(
      await tmdbList({ path: `/trending/${mediaType}/week`, mediaType, pages: 5 }),
      mediaType,
      TRENDING_VOTES[mediaType],
    )
  );
}

// popular (24h) — pool profundo: trending/region_top/popular se solapan mucho,
// así que necesitamos suficientes títulos únicos para que tras la deduplicación
// "Populares" conserve >= 15 elementos.
for (const mediaType of ['movie', 'tv']) {
  addPool('popular', mediaType, TTL_24H, async () =>
    refine(
      await tmdbList({ path: `/${mediaType}/popular`, mediaType, pages: 7 }),
      mediaType,
      POPULAR_VOTES[mediaType],
    )
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
    refine(await discoverPages(mediaType, discoverParams(mediaType, {
      sort_by: 'vote_average.desc',
      'vote_average.gte': 7.5,
      'vote_count.gte': ACCLAIMED_VOTES[mediaType],
    }), 3), mediaType, ACCLAIMED_VOTES[mediaType])
  );
}

// blockbusters (7d) — populares con muchísimos votos
for (const mediaType of ['movie', 'tv']) {
  addPool('blockbusters', mediaType, TTL_7D, async () =>
    refine(await discoverPages(mediaType, discoverParams(mediaType, {
      sort_by: 'popularity.desc',
      'vote_count.gte': BLOCKBUSTER_VOTES[mediaType],
    }), 3), mediaType, BLOCKBUSTER_VOTES[mediaType])
  );
}

// hidden_gems (7d) — bien valoradas con votos suficientes pero no masivos
for (const mediaType of ['movie', 'tv']) {
  addPool('hidden_gems', mediaType, TTL_7D, async () =>
    refine(await discoverPages(mediaType, discoverParams(mediaType, {
      sort_by: 'vote_average.desc',
      'vote_average.gte': 7.5,
      'vote_count.gte': GEM_VOTES[mediaType].gte,
      'vote_count.lte': GEM_VOTES[mediaType].lte,
    }), 3), mediaType, GEM_VOTES[mediaType].gte)
  );
}

// new_releases (24h) — PRÓXIMOS estrenos ordenados por popularidad (hype): los
// más esperados/importantes primero. El contenido sin estrenar no tiene votos,
// así que NO hay piso de votos y NO aplicamos el re-ranking por calidad (que se
// apoya en votos). Solo reglas de contenido (sin infantil/reality, asiático no
// predominante) preservando el orden de popularidad. La fila no rota
// (rotate:false en surfaces.js) para que se vean los más esperados primero.
function upcomingContentRules(cards) {
  const cleaned = capAsian(excludeKidsReality(dedupeCards(cards)));
  // Re-ranking SOLO por afinidad de idioma/país (en/es y US/ES arriba),
  // preservando el orden de popularidad dentro de cada nivel. No usamos el
  // re-ranking por calidad (se apoya en votos y los no estrenados no los tienen).
  // Así los estrenos relevantes para España encabezan y el cine regional
  // (turco, polaco, panyabí, urdu…) que capAsian no cubre baja de posición.
  return cleaned
    .map((card, index) => ({
      card,
      index,
      weightedRank: (cleaned.length - index) * localePriorityWeight(card),
    }))
    .sort((a, b) => b.weightedRank - a.weightedRank || a.index - b.index)
    .map(({ card }) => card);
}
addPool('new_releases', 'movie', TTL_24H, async () =>
  upcomingContentRules(await discoverPages('movie', {
    sort_by: 'popularity.desc',
    'primary_release_date.gte': dateOffset(0),       // de hoy en adelante
    'primary_release_date.lte': dateOffset(275),     // ~9 meses
  }, 4))
);
addPool('new_releases', 'tv', TTL_24H, async () =>
  upcomingContentRules(await discoverPages('tv', discoverParams('tv', {
    sort_by: 'popularity.desc',
    'first_air_date.gte': dateOffset(-30),           // novedades muy recientes + próximas
    'first_air_date.lte': dateOffset(275),
  }), 4))
);

// region_top (24h) — "Top hoy en España": lo más popular AHORA en streaming en
// España, RECIENTE (no histórico). Antes usaba popularidad GLOBAL con region=ES,
// lo que colaba clásicos muy conocidos y antiguos. Ahora filtramos por
// disponibilidad de streaming en ES (watch_region) y por recencia.
addPool('region_top', 'movie', TTL_24H, async () =>
  refine(await discoverPages('movie', {
    watch_region: 'ES',
    with_watch_monetization_types: 'flatrate|free|ads',
    sort_by: 'popularity.desc',
    'primary_release_date.gte': dateOffset(-900),    // ~2,5 años (excluye histórico)
    'primary_release_date.lte': dateOffset(0),
    'vote_count.gte': REGION_VOTES.movie,
  }, 4), 'movie', REGION_VOTES.movie)
);
addPool('region_top', 'tv', TTL_24H, async () =>
  refine(await discoverPages('tv', discoverParams('tv', {
    watch_region: 'ES',
    with_watch_monetization_types: 'flatrate|free|ads',
    sort_by: 'popularity.desc',
    'first_air_date.gte': dateOffset(-1095),         // ~3 años
    'vote_count.gte': REGION_VOTES.tv,
  }), 4), 'tv', REGION_VOTES.tv)
);

// curated rows (7d) — filas editoriales inspiradas en plataformas de streaming:
// temas amplios, reconocibles y con suficiente validación social para que sean
// útiles como recomendación general, no solo como clasificación por género.
addPool('curated:drama', 'movie', TTL_7D, async () =>
  refine(await discoverPages('movie', {
    with_genres: 18,
    sort_by: 'popularity.desc',
    'vote_average.gte': 6.6,
    'vote_count.gte': CURATED_VOTES.drama.movie,
  }, 4), 'movie', CURATED_VOTES.drama.movie)
);
addPool('curated:drama', 'tv', TTL_7D, async () =>
  refine(await discoverPages('tv', discoverParams('tv', {
    with_genres: 18,
    sort_by: 'popularity.desc',
    'vote_average.gte': 6.8,
    'vote_count.gte': CURATED_VOTES.drama.tv,
  }), 4), 'tv', CURATED_VOTES.drama.tv)
);

addPool('curated:action_adventure', 'movie', TTL_7D, async () =>
  refine(dedupeCards([
    ...(await discoverPages('movie', {
      with_genres: 28,
      sort_by: 'popularity.desc',
      'vote_average.gte': 6.4,
      'vote_count.gte': CURATED_VOTES.actionAdventure.movie,
    }, 3)),
    ...(await discoverPages('movie', {
      with_genres: 12,
      sort_by: 'popularity.desc',
      'vote_average.gte': 6.4,
      'vote_count.gte': CURATED_VOTES.actionAdventure.movie,
    }, 3)),
  ]), 'movie', CURATED_VOTES.actionAdventure.movie)
);
addPool('curated:action_adventure', 'tv', TTL_7D, async () =>
  refine(dedupeCards([
    ...(await discoverPages('tv', discoverParams('tv', {
      with_genres: 10759,
      sort_by: 'popularity.desc',
      'vote_average.gte': 6.7,
      'vote_count.gte': CURATED_VOTES.actionAdventure.tv,
    }), 3)),
    ...(await discoverPages('tv', discoverParams('tv', {
      with_genres: 10765,
      sort_by: 'popularity.desc',
      'vote_average.gte': 6.7,
      'vote_count.gte': CURATED_VOTES.actionAdventure.tv,
    }), 3)),
  ]), 'tv', CURATED_VOTES.actionAdventure.tv)
);

addPool('curated:nostalgia_millennial', 'movie', TTL_30D, async () =>
  refine(await discoverPages('movie', {
    'primary_release_date.gte': '1995-01-01',
    'primary_release_date.lte': '2012-12-31',
    sort_by: 'popularity.desc',
    'vote_average.gte': 6.6,
    'vote_count.gte': CURATED_VOTES.nostalgia.movie,
  }, 5), 'movie', CURATED_VOTES.nostalgia.movie)
);
addPool('curated:nostalgia_millennial', 'tv', TTL_30D, async () =>
  refine(await discoverPages('tv', discoverParams('tv', {
    'first_air_date.gte': '1995-01-01',
    'first_air_date.lte': '2012-12-31',
    sort_by: 'popularity.desc',
    'vote_average.gte': 6.8,
    'vote_count.gte': CURATED_VOTES.nostalgia.tv,
  }), 5), 'tv', CURATED_VOTES.nostalgia.tv)
);

// genre pools (7d) — por género en MOVIE_GENRES y TV_GENRES.
// Pool más profundo (4 págs): tras limitar el contenido asiático (p. ej. el
// género Animación es mayoritariamente anime) necesitamos margen para >= 15.
for (const { id } of MOVIE_GENRES) {
  const poolKey = `genre:${id}`;
  addPool(poolKey, 'movie', TTL_7D, async () =>
    refine(await discoverPages('movie', {
      with_genres: id,
      sort_by: 'popularity.desc',
      'vote_count.gte': GENRE_VOTES.movie,
    }, 4), 'movie', GENRE_VOTES.movie)
  );
}
for (const { id } of TV_GENRES) {
  const poolKey = `genre:${id}`;
  addPool(poolKey, 'tv', TTL_7D, async () =>
    refine(await discoverPages('tv', discoverParams('tv', {
      with_genres: id,
      sort_by: 'popularity.desc',
      'vote_count.gte': GENRE_VOTES.tv,
    }), 4), 'tv', GENRE_VOTES.tv)
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
    refine(await discoverPages('tv', discoverParams('tv', {
      'first_air_date.gte': dateGte,
      'first_air_date.lte': dateLte,
      sort_by: 'popularity.desc',
      'vote_count.gte': DECADE_VOTES.tv,
    }), 5), 'tv', DECADE_VOTES.tv)
  );
}

// ─── getPool ──────────────────────────────────────────────────────────────────
// Reconstrucciones en curso por pool: si varias peticiones (o el precalentado y
// un usuario) piden el MISMO pool frío a la vez, solo se reconstruye una vez y el
// resto espera esa promesa. Evita trabajo duplicado y ráfagas a TMDB.
const inFlightBuilds = new Map(); // defKey -> Promise<items>

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

  // ¿Ya hay una reconstrucción en curso para este pool? Reutilízala.
  const existing = inFlightBuilds.get(defKey);
  if (existing) return existing;

  const build = (async () => {
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
    } finally {
      inFlightBuilds.delete(defKey);
    }
  })();

  inFlightBuilds.set(defKey, build);
  return build;
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
  const stale = [];
  for (const [key, def] of POOL_DEFS) {
    const row = rowMap.get(key);
    if (!row || row.expiresAt <= now) stale.push(def);
  }

  // Reconstruimos en lotes paralelos (concurrencia acotada) para calentar rápido
  // sin saturar TMDB.
  const BATCH = 4;
  for (let i = 0; i < stale.length; i += BATCH) {
    const batch = stale.slice(i, i + BATCH);
    await Promise.all(batch.map((def) => getPool(def.poolKey, def.mediaType).catch(() => [])));
    built += batch.length;
  }

  return { built };
}
