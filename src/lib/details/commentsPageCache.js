// Páginas de comentarios ya cargadas en esta sesión, por título, filtro
// (Populares / Recientes, con o sin «Más likes») y página. La comparten la
// ficha, la vista de teléfono y la vista lateral (esta, a través de su
// `onLoadPage`): cambiar a un filtro ya visto es instantáneo, sin vaciar la
// lista ni enseñar la carga. Lo que se revalida en segundo plano sustituye a lo
// cacheado sin parpadeo.

import { COMMENT_TABS, commentFiltersKey } from "@/lib/details/commentFilters";

const MAX_AGE_MS = 5 * 60 * 1000;
const pages = new Map();

const mediaKey = (type) => (type === "show" || type === "tv" ? "tv" : "movie");

function cacheId({ type, tmdbId, tab, byLikes, page = 1 }) {
  return `${mediaKey(type)}:${tmdbId}:${commentFiltersKey({ tab, byLikes })}:${Number(page) || 1}`;
}

/** Página cacheada ({ items, page, pageCount, total }) o null si no hay o caducó. */
export function readCommentsPage(filter) {
  const entry = pages.get(cacheId(filter));
  if (!entry || Date.now() - entry.t > MAX_AGE_MS) return null;
  return entry.value;
}

export function writeCommentsPage(filter, value) {
  pages.set(cacheId(filter), { t: Date.now(), value });
}

/** La página cacheada con la forma de la respuesta de la API. */
export function cachedCommentsResponse(filter) {
  const value = readCommentsPage(filter);
  if (!value) return null;
  return {
    items: value.items,
    pagination: {
      itemCount: value.total,
      pageCount: value.pageCount,
      page: value.page,
      limit: value.items.length,
    },
  };
}

/** Normaliza una respuesta de la API a lo que se guarda. */
export function commentsPageFromResponse(response, page = 1) {
  const items = Array.isArray(response?.items) ? response.items : [];
  const pagination = response?.pagination || {};
  return {
    items,
    page: Number(pagination.page || page) || 1,
    pageCount: Number(pagination.pageCount || 0),
    total: Number(pagination.itemCount || 0),
  };
}

const prefetched = new Set();

/**
 * Precarga la primera página de los OTROS filtros del título (una sola vez por
 * título y sesión), cuando el navegador está ocioso: así el primer cambio de
 * pestaña o de orden también es instantáneo.
 */
export function prefetchOtherCommentFilters({ type, tmdbId, current, load }) {
  const titleKey = `${mediaKey(type)}:${tmdbId}`;
  if (!tmdbId || prefetched.has(titleKey) || typeof window === "undefined") return;
  prefetched.add(titleKey);
  const run = async () => {
    const filters = COMMENT_TABS.flatMap((tab) => [
      { tab: tab.id, byLikes: false },
      { tab: tab.id, byLikes: true },
    ]).filter((filter) => commentFiltersKey(filter) !== commentFiltersKey(current));
    for (const filter of filters) {
      const target = { type, tmdbId, ...filter, page: 1 };
      if (readCommentsPage(target)) continue;
      try {
        writeCommentsPage(target, commentsPageFromResponse(await load(filter), 1));
      } catch {
        // Sin precarga: ese filtro se pedirá al pulsarlo.
      }
    }
  };
  const idle = window.requestIdleCallback || ((fn) => window.setTimeout(fn, 1200));
  idle(() => { void run(); }, { timeout: 4000 });
}
