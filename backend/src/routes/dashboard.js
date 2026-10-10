// src/routes/dashboard.js
// GET /v1/dashboard/:surface — assembles dashboard rows for home, movies, series surfaces.

import { SURFACES, personalizedRowDefs } from '../dashboard/surfaces.js';
import { getPool, dedupeCards } from '../dashboard/pools.js';
import { getUserRecommendations } from '../dashboard/recommendations.js';
import { loadLibrary, libraryBasisHash, dislikedIds } from '../dashboard/library.js';
import { rankRowItems, MIXED_GENRES, cardKey, stableHash } from '../dashboard/ranking.js';
import { assembleRows } from '../dashboard/assemble.js';
import { dayNumber, pickRotating } from '../dashboard/rotation.js';
import { MOVIE_GENRES, TV_GENRES } from '../dashboard/tmdb.js';

// ─── interleave ──────────────────────────────────────────────────────────────
// Alternate one card from `a` and one from `b` until both are exhausted.
function interleave(a, b) {
  const out = [];
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (i < a.length) out.push(a[i]);
    if (i < b.length) out.push(b[i]);
  }
  return dedupeCards(out);
}

// ─── resolvePoolItems ────────────────────────────────────────────────────────
async function resolvePoolItems(poolKey, mediaType, getPool) {
  if (mediaType === 'mixed') {
    const [mv, tv] = await Promise.all([
      getPool(poolKey, 'movie').catch(() => []),
      getPool(poolKey, 'tv').catch(() => []),
    ]);
    return interleave(mv, tv);
  }
  return getPool(poolKey, mediaType).catch(() => []);
}

// Desfase de semilla por superficie: la rotación diaria sigue cambiando cada
// día, pero con una fase distinta en Inicio/Películas/Series para que "Para ti"
// (y las filas rotativas) no muestren exactamente el mismo set entre dashboards.
const SURFACE_SEED_OFFSET = { home: 0, movies: 1009, series: 2017 };
const DASHBOARD_ITEMS_PER_ROW = 32;
const DASHBOARD_MIN_ITEMS_PER_ROW = 12;

// Filas cuyo orden ES la información (no se barajan): "Estrenos" va ordenado por
// hype/popularidad y "Top hoy en España" es un ranking. El resto rota a diario.
const NON_ROTATING_POOLS = new Set([
  'trending',
  'popular',
  'top_rated',
  'anticipated',
  'new_releases',
  'region_top',
]);

// ─── Route plugin ─────────────────────────────────────────────────────────────
export default async function dashboardRoutes(fastify, options = {}) {
  const { getPool: pool = getPool, loadLibrary: library = loadLibrary, getUserRecommendations: recommend = getUserRecommendations } = options.sources || {};
  fastify.get('/:surface', async (req, reply) => {
    const surfaceKey = req.params.surface;
    const surface = SURFACES[surfaceKey];
    if (!surface) return reply.status(404).send({ error: 'Unknown surface' });

    const userId = req.user?.id || null;
    const seed = dayNumber() + (SURFACE_SEED_OFFSET[surfaceKey] || 0) + stableHash(userId || 'anonymous');
    // Public pools and private recommendations build concurrently.
    const libraryPromise = userId ? library(userId).catch(() => null) : Promise.resolve(null);
    const recommendationsPromise = libraryPromise.then(async (lib) => {
      if (!lib) return {};
      const basisHash = libraryBasisHash(lib);
      return Object.fromEntries(await Promise.all(surface.mediaTypes.map(async (mt) =>
        [mt, await recommend(userId, mt, { lib, basisHash }).catch(() => [])],
      )));
    });

    // ── Build generic specs ──────────────────────────────────────────────────
    // Todas las filas en paralelo (antes en serie): con los pools ya calientes,
    // pasa de ~N×latencia de lecturas a ~1×. Se preserva el orden de definición
    // (importante para la deduplicación cruzada del ensamblaje).
    const genericSpecGroups = await Promise.all(
      surface.genericRows.map(async (def) => {
        try {
          const { kind } = def.source;

          if (kind === 'pool') {
            const items = await resolvePoolItems(def.source.poolKey, def.mediaType, pool);
            return [{
              key: def.key,
              title: def.title,
              reason: null,
              mediaType: def.mediaType,
              items,
              rotate: !NON_ROTATING_POOLS.has(def.source.poolKey),
            }];
          }

          if (kind === 'genreRotating') {
            const genres = def.mediaType === 'mixed' ? MIXED_GENRES : def.mediaType === 'tv' ? TV_GENRES : MOVIE_GENRES;
            const picked = pickRotating(genres, seed, def.source.count);
            const rows = await Promise.all(picked.map(async (g) => {
              try {
                let items;
                if (def.mediaType === 'mixed') {
                  const [mv, tv] = await Promise.all([
                    Promise.all(g.movie.map((id) => pool(`genre:${id}`, 'movie').catch(() => []))).then((items) => items.flat()),
                    Promise.all(g.tv.map((id) => pool(`genre:${id}`, 'tv').catch(() => []))).then((items) => items.flat()),
                  ]);
                  items = interleave(mv, tv);
                } else {
                  items = await pool(`genre:${g.id}`, def.mediaType).catch(() => []);
                }
                return { key: `genre_${g.id}`, title: g.label, reason: null, mediaType: def.mediaType, items, rotate: true };
              } catch {
                return null;
              }
            }));
            return rows.filter(Boolean);
          }

          if (kind === 'decadeRotating') {
            const decades = ['1980', '1990', '2000', '2010', '2020'];
            // Décadas en orden cronológico (1980 → 2020).
            const picked = pickRotating(decades, seed + 7, def.source.count).sort(
              (a, b) => Number(a) - Number(b),
            );
            const rows = await Promise.all(picked.map(async (d) => {
              try {
                let items;
                if (def.mediaType === 'mixed') {
                  const [mv, tv] = await Promise.all([
                    pool(`decade:${d}`, 'movie').catch(() => []),
                    pool(`decade:${d}`, 'tv').catch(() => []),
                  ]);
                  items = interleave(mv, tv);
                } else {
                  items = await pool(`decade:${d}`, def.mediaType).catch(() => []);
                }
                return { key: `decade_${d}`, title: `Lo mejor de ${d}`, reason: null, mediaType: def.mediaType, items, rotate: true };
              } catch {
                return null;
              }
            }));
            return rows.filter(Boolean);
          }

          return [];
        } catch {
          return [];
        }
      }),
    );
    const genericSpecs = genericSpecGroups.flat();

    // ── Personalized specs (authed only) ─────────────────────────────────────
    let personalized = false;
    let personalSpecs = [];
    // Títulos "ya vistos" (historial ∪ favoritos ∪ valorados). Las filas
    // genéricas los permiten sin límite; las personalizadas, de forma acotada
    // (seenRatioLimit). NO se excluyen por completo de ninguna fila.
    const seenIds = new Set();

    const lib = await libraryPromise;
    const recsByType = await recommendationsPromise;
    if (lib) {
      try {
        personalSpecs = personalizedRowDefs(recsByType, surface);
        personalized = personalSpecs.length > 0;
        for (const r of [...lib.history, ...lib.favorites, ...lib.ratings]) {
          seenIds.add(`${r.mediaType}:${r.tmdbId}`);
        }
      } catch (e) {
        req.log?.warn?.({ e }, 'dashboard personalization failed');
      }
    }

    const affinity = new Map();
    for (const items of Object.values(recsByType)) {
      const max = Math.max(1, ...items.map((card) => card.score || 0));
      for (const card of items) affinity.set(cardKey(card), Math.sqrt(Math.max(0, card.score || 0) / max));
    }
    // Rank before allocation; the assembler must not shuffle away relevance.
    const specs = [...personalSpecs, ...genericSpecs].map((row) => ({
      ...row, items: rankRowItems(row, { seed, recommendations: affinity, surface: surfaceKey, cohortSeed: dayNumber() + stableHash(userId || 'anonymous') }), rotate: false,
    }));
    // ── Assemble final rows ───────────────────────────────────────────────────
    const rows = assembleRows({
      rowSpecs: specs,
      rotationSeed: seed,
      perRow: DASHBOARD_ITEMS_PER_ROW,
      minItems: DASHBOARD_MIN_ITEMS_PER_ROW,
      seenIds,
      excludeIds: dislikedIds(lib),
      fairAllocation: true,
      maxAppearances: 2,
      repeatRatio: 0.125,
    });
    personalized = rows.some((row) => personalSpecs.some((spec) => spec.key === row.key));

    reply.header('Cache-Control', 'private, max-age=300');
    return {
      surface: surfaceKey,
      personalized,
      generatedAt: new Date().toISOString(),
      rows,
    };
  });
}
