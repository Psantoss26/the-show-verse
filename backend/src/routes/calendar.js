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

const MAX_ITEMS = 20;
// Series "en progreso" a considerar: las más recientes del historial. Evita
// enriquecer cientos de series con detalles de TMDB por petición.
const MAX_IN_PROGRESS = 60;

// Orden canónico de prioridad de las fuentes (para el badge del cliente).
const SOURCE_ORDER = ['in_progress', 'favorite', 'watchlist'];
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
        return { items: base.slice(0, MAX_ITEMS) };
      }

      const sourcesByShow = await loadUserShowSources(userId);

      // Etiqueta las entradas de la base que sean series del usuario.
      const baseUserIds = new Set();
      for (const entry of base) {
        const id = Number(entry?.show?.tmdbId);
        const srcs = sourcesByShow.get(id);
        if (srcs) {
          entry.sources = orderSources(srcs);
          baseUserIds.add(id);
        }
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

      // Series del usuario primero (por fecha), luego el resto de la base.
      const userBaseEntries = base.filter((entry) =>
        baseUserIds.has(Number(entry?.show?.tmdbId)),
      );
      const restBase = base.filter(
        (entry) => !baseUserIds.has(Number(entry?.show?.tmdbId)),
      );

      const prioritized = [...userOnlyEntries, ...userBaseEntries].sort(byAirDate);
      const items = dedupeById([
        ...prioritized,
        ...restBase.sort(byAirDate),
      ]).slice(0, MAX_ITEMS);

      reply.header('Cache-Control', 'private, no-store');
      return { items };
    } catch (err) {
      req.log?.warn?.({ err }, 'calendar episodes failed');
      return { items: [] };
    }
  });
}
