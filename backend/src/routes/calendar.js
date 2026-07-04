// src/routes/calendar.js
// GET /v1/calendar/episodes — próximos episodios de series para el "Calendario"
// del home. Auth OPCIONAL (como /v1/dashboard): anónimo devuelve la base de series
// populares; autenticado prioriza las series del usuario (en progreso, favoritos y
// pendientes) leídas de la BBDD propia. NUNCA consulta Trakt.

import { db } from '../db/client.js';
import { favorites, watchlist, watchHistory } from '../db/schema.js';
import { and, eq, desc } from 'drizzle-orm';
import {
  getPool,
  getCalendarShowDetails,
  buildUpcomingEpisodeEntry,
  withinCalendarWindow,
  mapLimit,
} from '../dashboard/pools.js';
import { loadLibrary, libraryBasisHash } from '../dashboard/library.js';
import { getUserRecommendations } from '../dashboard/recommendations.js';

const MAX_ITEMS = 30;
// Series "en progreso" a considerar: las más recientes del historial. Evita
// enriquecer cientos de series con detalles de TMDB por petición.
const MAX_IN_PROGRESS = 60;
// Series recomendadas (fuera de la base popular) a enriquecer con TMDB por
// petición: acota el coste de llamadas al detalle de próximos episodios.
const MAX_RECOMMENDED_ENRICH = 24;

// Orden canónico de prioridad de las fuentes (para el badge del cliente).
// "recommended" va tras las del usuario: relleno personalizado por delante de
// lo meramente popular.
const SOURCE_ORDER = ['in_progress', 'favorite', 'watchlist', 'recommended'];
function orderSources(set) {
  if (!set) return [];
  return SOURCE_ORDER.filter((source) => set.has(source));
}

const byAirDate = (a, b) =>
  (a?.episode?.airDate || '').localeCompare(b?.episode?.airDate || '');

function dedupeById(list) {
  const seen = new Set();
  const out = [];
  for (const entry of list) {
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
  }
  return out;
}

// Series TV del usuario (BBDD) → Map<tmdbId, Set<source>>.
async function loadUserShowSources(userId) {
  const sourcesByShow = new Map();
  const add = (tmdbId, source) => {
    const id = Number(tmdbId);
    if (!Number.isFinite(id)) return;
    if (!sourcesByShow.has(id)) sourcesByShow.set(id, new Set());
    sourcesByShow.get(id).add(source);
  };

  const [favRows, wlRows, histRows] = await Promise.all([
    db
      .select({ tmdbId: favorites.tmdbId })
      .from(favorites)
      .where(and(eq(favorites.userId, userId), eq(favorites.mediaType, 'tv'))),
    db
      .select({ tmdbId: watchlist.tmdbId })
      .from(watchlist)
      .where(and(eq(watchlist.userId, userId), eq(watchlist.mediaType, 'tv'))),
    db
      .select({ tmdbId: watchHistory.tmdbId, watchedAt: watchHistory.watchedAt })
      .from(watchHistory)
      .where(and(eq(watchHistory.userId, userId), eq(watchHistory.mediaType, 'tv')))
      .orderBy(desc(watchHistory.watchedAt))
      .limit(400),
  ]);

  for (const row of favRows) add(row.tmdbId, 'favorite');
  for (const row of wlRows) add(row.tmdbId, 'watchlist');

  // "En progreso": series distintas del historial, las más recientes primero.
  const seenHistory = new Set();
  for (const row of histRows) {
    const id = Number(row.tmdbId);
    if (!Number.isFinite(id) || seenHistory.has(id)) continue;
    seenHistory.add(id);
    if (seenHistory.size > MAX_IN_PROGRESS) break;
    add(id, 'in_progress');
  }

  return sourcesByShow;
}

export default async function calendarRoutes(fastify) {
  // GET /v1/calendar/episodes
  fastify.get('/episodes', async (req, reply) => {
    const userId = req.user?.id || null;

    try {
      const base = await getPool('calendar_episodes', 'tv').catch(() => []);

      if (!userId) {
        reply.header('Cache-Control', 'public, max-age=300');
        // La base es un pool compartido/cacheado: se copian las entradas y se
        // normaliza `sources` a [] (el anónimo no tiene fuentes de usuario).
        return {
          items: base.slice(0, MAX_ITEMS).map((e) => ({ ...e, sources: [] })),
        };
      }

      // Biblioteca del usuario (una sola carga) para fuentes + recomendaciones.
      const [sourcesByShow, lib] = await Promise.all([
        loadUserShowSources(userId),
        loadLibrary(userId),
      ]);

      // Recomendaciones de series (personalizadas), ordenadas por score. Se usan
      // como relleno tras las series del usuario y por delante de las populares.
      // Degradación elegante: si fallan, seguimos solo con la base.
      let recommendedIds = [];
      try {
        const recs = await getUserRecommendations(userId, 'tv', {
          lib,
          basisHash: libraryBasisHash(lib),
        });
        recommendedIds = (recs || [])
          .map((c) => Number(c?.tmdbId))
          .filter((id) => Number.isFinite(id) && !sourcesByShow.has(id));
      } catch (e) {
        req.log?.warn?.({ e }, 'calendar recommendations failed');
      }
      const recommendedSet = new Set(recommendedIds);

      // Detecta (SIN mutar el pool compartido) qué entradas de la base son series
      // del usuario.
      const baseUserIds = new Set();
      for (const entry of base) {
        const id = Number(entry?.show?.tmdbId);
        if (sourcesByShow.has(id)) baseUserIds.add(id);
      }

      // Series del usuario que NO están en la base: se enriquecen aparte.
      const userOnlyIds = [...sourcesByShow.keys()].filter(
        (id) => !baseUserIds.has(id),
      );
      const userOnlyEntries = (
        await mapLimit(userOnlyIds, 8, async (tmdbId) => {
          const details = await getCalendarShowDetails(tmdbId);
          if (!details || !withinCalendarWindow(details.nextEpisode?.air_date)) {
            return null;
          }
          return buildUpcomingEpisodeEntry(
            details,
            details.nextEpisode,
            orderSources(sourcesByShow.get(tmdbId)),
          );
        })
      ).filter(Boolean);

      // Base dividida en tres grupos, con COPIAS y `sources` correctas (nunca se
      // muta el pool cacheado compartido; se normaliza el `sources` heredado).
      const userBaseEntries = [];
      const recommendedBaseEntries = [];
      const popularBaseEntries = [];
      for (const entry of base) {
        const id = Number(entry?.show?.tmdbId);
        if (baseUserIds.has(id)) {
          userBaseEntries.push({
            ...entry,
            sources: orderSources(sourcesByShow.get(id)),
          });
        } else if (recommendedSet.has(id)) {
          recommendedBaseEntries.push({ ...entry, sources: ['recommended'] });
        } else {
          popularBaseEntries.push({ ...entry, sources: [] });
        }
      }

      // Series recomendadas que NO están en la base: se enriquecen (con tope).
      const recBaseIds = new Set(
        recommendedBaseEntries.map((entry) => Number(entry?.show?.tmdbId)),
      );
      const recOnlyIds = recommendedIds
        .filter((id) => !recBaseIds.has(id))
        .slice(0, MAX_RECOMMENDED_ENRICH);
      const recOnlyEntries = (
        await mapLimit(recOnlyIds, 8, async (tmdbId) => {
          const details = await getCalendarShowDetails(tmdbId);
          if (!details || !withinCalendarWindow(details.nextEpisode?.air_date)) {
            return null;
          }
          return buildUpcomingEpisodeEntry(details, details.nextEpisode, [
            'recommended',
          ]);
        })
      ).filter(Boolean);

      // Prioridad: (1) tus series (progreso/favoritos/pendientes),
      // (2) recomendadas, (3) populares. Cada grupo ordenado por fecha de emisión.
      const tracked = [...userOnlyEntries, ...userBaseEntries].sort(byAirDate);
      const recommended = [...recOnlyEntries, ...recommendedBaseEntries].sort(
        byAirDate,
      );
      const popular = popularBaseEntries.sort(byAirDate);

      const items = dedupeById([...tracked, ...recommended, ...popular]).slice(
        0,
        MAX_ITEMS,
      );

      reply.header('Cache-Control', 'private, no-store');
      return { items };
    } catch (err) {
      req.log?.warn?.({ err }, 'calendar episodes failed');
      return { items: [] };
    }
  });
}
