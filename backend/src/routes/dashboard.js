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

// ─── Route plugin ─────────────────────────────────────────────────────────────
export default async function dashboardRoutes(fastify) {
  fastify.get('/:surface', async (req, reply) => {
    const surfaceKey = req.params.surface;
    const surface = SURFACES[surfaceKey];
    if (!surface) return reply.status(404).send({ error: 'Unknown surface' });

    const seed = dayNumber();
    const userId = req.user?.id || null;

    // ── Build generic specs ──────────────────────────────────────────────────
    const genericSpecs = [];

    for (const def of surface.genericRows) {
      try {
        const { kind } = def.source;

        if (kind === 'pool') {
          const items = await resolvePoolItems(def.source.poolKey, def.mediaType);
          genericSpecs.push({
            key: def.key,
            title: def.title,
            reason: null,
            mediaType: def.mediaType,
            items,
            rotate: true,
          });
        } else if (kind === 'genreRotating') {
          const genres = def.mediaType === 'tv' ? TV_GENRES : MOVIE_GENRES;
          const picked = pickRotating(genres, seed, def.source.count);
          for (const g of picked) {
            try {
              let items;
              if (def.mediaType === 'mixed') {
                items = dedupeCards([
                  ...(await getPool(`genre:${g.id}`, 'movie').catch(() => [])),
                  ...(await getPool(`genre:${g.id}`, 'tv').catch(() => [])),
                ]);
              } else {
                items = await getPool(`genre:${g.id}`, def.mediaType).catch(() => []);
              }
              genericSpecs.push({
                key: `genre_${g.id}`,
                title: g.label,
                reason: null,
                mediaType: def.mediaType,
                items,
                rotate: true,
              });
            } catch {
              // skip this genre row if it fails
            }
          }
        } else if (kind === 'decadeRotating') {
          const decades = ['1980', '1990', '2000', '2010', '2020'];
          const picked = pickRotating(decades, seed + 7, def.source.count);
          for (const d of picked) {
            try {
              let items;
              if (def.mediaType === 'mixed') {
                items = dedupeCards([
                  ...(await getPool(`decade:${d}`, 'movie').catch(() => [])),
                  ...(await getPool(`decade:${d}`, 'tv').catch(() => [])),
                ]);
              } else {
                items = await getPool(`decade:${d}`, def.mediaType).catch(() => []);
              }
              genericSpecs.push({
                key: `decade_${d}`,
                title: `Lo mejor de los ${d}`,
                reason: null,
                mediaType: def.mediaType,
                items,
                rotate: true,
              });
            } catch {
              // skip this decade row if it fails
            }
          }
        }
      } catch {
        // skip this entire row def if it fails
      }
    }

    // ── Personalized specs (authed only) ─────────────────────────────────────
    let personalized = false;
    let personalSpecs = [];
    const excludeIds = new Set();

    if (userId) {
      try {
        const lib = await loadLibrary(userId);
        const basisHash = libraryBasisHash(lib);
        const recsByType = {};
        for (const mt of surface.mediaTypes) {
          recsByType[mt] = await getUserRecommendations(userId, mt, { lib, basisHash });
        }
        personalSpecs = personalizedRowDefs(recsByType, surface);
        personalized = personalSpecs.length > 0;
        for (const r of [...lib.history, ...lib.favorites]) {
          excludeIds.add(`${r.mediaType}:${r.tmdbId}`);
        }
      } catch (e) {
        req.log?.warn?.({ e }, 'dashboard personalization failed');
      }
    }

    // ── Assemble final rows ───────────────────────────────────────────────────
    const rows = assembleRows({
      rowSpecs: [...personalSpecs, ...genericSpecs],
      rotationSeed: seed,
      perRow: 20,
      excludeIds,
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
