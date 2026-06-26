// src/routes/dashboard.js
// GET /v1/dashboard/:surface — assembles dashboard rows for home, movies, series surfaces.

import { SURFACES, personalizedRowDefs } from '../dashboard/surfaces.js';
import { getPool, dedupeCards } from '../dashboard/pools.js';
import { getUserRecommendations } from '../dashboard/recommendations.js';
import { loadLibrary, libraryBasisHash } from '../dashboard/library.js';
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
async function resolvePoolItems(poolKey, mediaType) {
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
const DASHBOARD_ITEMS_PER_ROW = 28;
const DASHBOARD_MIN_ITEMS_PER_ROW = 15;

// Filas cuyo orden ES la información (no se barajan): "Estrenos" va ordenado por
// hype/popularidad y "Top hoy en España" es un ranking. El resto rota a diario.
const NON_ROTATING_POOLS = new Set(['new_releases', 'region_top']);

// ─── Route plugin ─────────────────────────────────────────────────────────────
export default async function dashboardRoutes(fastify) {
  fastify.get('/:surface', async (req, reply) => {
    const surfaceKey = req.params.surface;
    const surface = SURFACES[surfaceKey];
    if (!surface) return reply.status(404).send({ error: 'Unknown surface' });

    const seed = dayNumber() + (SURFACE_SEED_OFFSET[surfaceKey] || 0);
    const userId = req.user?.id || null;

    // ── Build generic specs ──────────────────────────────────────────────────
    // Todas las filas en paralelo (antes en serie): con los pools ya calientes,
    // pasa de ~N×latencia de lecturas a ~1×. Se preserva el orden de definición
    // (importante para la deduplicación cruzada del ensamblaje).
    const genericSpecGroups = await Promise.all(
      surface.genericRows.map(async (def) => {
        try {
          const { kind } = def.source;

          if (kind === 'pool') {
            const items = await resolvePoolItems(def.source.poolKey, def.mediaType);
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
            const genres = def.mediaType === 'tv' ? TV_GENRES : MOVIE_GENRES;
            const picked = pickRotating(genres, seed, def.source.count);
            const rows = await Promise.all(picked.map(async (g) => {
              try {
                let items;
                if (def.mediaType === 'mixed') {
                  const [mv, tv] = await Promise.all([
                    getPool(`genre:${g.id}`, 'movie').catch(() => []),
                    getPool(`genre:${g.id}`, 'tv').catch(() => []),
                  ]);
                  items = dedupeCards([...mv, ...tv]);
                } else {
                  items = await getPool(`genre:${g.id}`, def.mediaType).catch(() => []);
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
                    getPool(`decade:${d}`, 'movie').catch(() => []),
                    getPool(`decade:${d}`, 'tv').catch(() => []),
                  ]);
                  items = dedupeCards([...mv, ...tv]);
                } else {
                  items = await getPool(`decade:${d}`, def.mediaType).catch(() => []);
                }
                return { key: `decade_${d}`, title: `Lo mejor de los ${d}`, reason: null, mediaType: def.mediaType, items, rotate: true };
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

    if (userId) {
      try {
        const lib = await loadLibrary(userId);
        const basisHash = libraryBasisHash(lib);
        const recsByType = {};
        // movie y tv en paralelo (en Inicio eran 2 builds en serie).
        await Promise.all(
          surface.mediaTypes.map(async (mt) => {
            recsByType[mt] = await getUserRecommendations(userId, mt, { lib, basisHash });
          }),
        );
        personalSpecs = personalizedRowDefs(recsByType, surface);
        personalized = personalSpecs.length > 0;
        for (const r of [...lib.history, ...lib.favorites, ...lib.ratings]) {
          seenIds.add(`${r.mediaType}:${r.tmdbId}`);
        }
      } catch (e) {
        req.log?.warn?.({ e }, 'dashboard personalization failed');
      }
    }

    // ── Assemble final rows ───────────────────────────────────────────────────
    const rows = assembleRows({
      rowSpecs: [...personalSpecs, ...genericSpecs],
      rotationSeed: seed,
      perRow: DASHBOARD_ITEMS_PER_ROW,
      minItems: DASHBOARD_MIN_ITEMS_PER_ROW,
      seenIds,
    });

    reply.header('Cache-Control', 'private, max-age=300');
    return {
      surface: surfaceKey,
      personalized,
      generatedAt: new Date().toISOString(),
      rows,
    };
  });
}
