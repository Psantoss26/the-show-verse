export function resolveCollectionDetailsInitialState(cached) {
  return {
    loading: !cached,
    error: null,
    collection: cached?.collection || null,
    parts: Array.isArray(cached?.parts) ? cached.parts : [],
  };
}

export function resolveCommunityListDetailsInitialState(cached) {
  return {
    loading: !cached,
    loadingMore: false,
    error: null,
    list: cached?.list || null,
    ratingSummary: cached?.ratingSummary || null,
    imdbRatingItems: Array.isArray(cached?.imdbRatingItems) ? cached.imdbRatingItems : [],
    items: Array.isArray(cached?.items) ? cached.items : [],
    page: cached?.page || 1,
    hasMore: Boolean(cached?.hasMore),
  };
}

export function getCommunityListDetailsCacheKey(listId) {
  return listId ? `showverse:list-details:community:${listId}:v1` : null;
}

// La caché de una ficha de lista solo puede sembrar el primer render cuando
// volvemos con atrás/adelante. En una entrada normal se revalida desde la red
// para no mostrar una lista desactualizada de otra sesión o dispositivo.
// Mantener esta decisión en un helper permite que listas personales, de
// comunidad y colecciones respeten exactamente el mismo contrato.
export function resolveBackNavigationDetailsSnapshot(
  cached,
  isBackNavigation,
) {
  return isBackNavigation && cached ? cached : null;
}

export function shouldRenderCachedListDuringAuthHydration({
  canUse,
  hydrated,
  hasCachedData,
}) {
  return Boolean(canUse || (!hydrated && hasCachedData));
}

// ------------------------------------------------------------------------
// VISTA PROVISIONAL DESDE EL ÍNDICE DE LISTAS
//
// Las fichas de lista devolvían `null` hasta tener sus datos: al abrir una sin
// caché propia la pantalla se quedaba vacía 2-3 s (más en las propias, que
// esperan también a la sesión). Pero quien llega desde /lists ya tiene esa
// lista en la caché del índice (`showverse:lists:index:<fuente>:<ámbito>:v1`, v2 en colecciones,
// ver app/lists/page.jsx) con su nombre, descripción, recuento y portada: con
// eso se pinta la cabecera al instante y solo los títulos esperan.

const LISTS_INDEX_CACHE_PREFIX = 'showverse:lists:index:'
// Misma vigencia que la caché del índice (LISTS_SOURCE_CACHE_TTL_MS).
const LISTS_INDEX_CACHE_TTL_MS = 20 * 60 * 1000

/**
 * Busca la lista `id` en las cachés del índice de la fuente (`personal`,
 * `trakt` o `collections`, en cualquiera de sus ámbitos). `storage` es un
 * Storage (sessionStorage) o equivalente; null si no está o ha caducado.
 */
export function findListInIndexCache(source, id, {
  storage = typeof window !== 'undefined' ? window.sessionStorage : null,
  now = Date.now(),
  ttlMs = LISTS_INDEX_CACHE_TTL_MS,
} = {}) {
  if (!storage || id == null || id === '') return null
  const prefix = `${LISTS_INDEX_CACHE_PREFIX}${source}:`
  const wanted = String(id)
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (!key || !key.startsWith(prefix)) continue
      const parsed = JSON.parse(storage.getItem(key) || 'null')
      const t = Number(parsed?.t || 0)
      if (!t || now - t > ttlMs || !Array.isArray(parsed?.data)) continue
      const hit = parsed.data.find((list) => String(list?.id) === wanted)
      if (hit) return hit
    }
  } catch {
    // Storage no disponible o entrada corrupta: sin vista provisional.
  }
  return null
}

// El índice guarda el nombre de las colecciones SIN «- Colección» (lo limpia
// /api/tmdb/collections/featured); la ficha usa el de TMDb, que lo lleva. Se
// repone para que el título no cambie al llegar los datos.
export function collectionPreviewFromIndex(entry) {
  if (!entry?.id) return null
  const name = String(entry.name || '').trim()
  return {
    id: String(entry.id),
    name: name ? `${name} - Colección` : 'Colección',
    description: entry.description || '',
    item_count: Number(entry.item_count) || 0,
    poster_path: entry.poster_path || null,
    backdrop_path: entry.backdrop_path || null,
    cast: [],
    revenue: 0,
  }
}

export function communityListPreviewFromIndex(entry) {
  if (!entry?.id) return null
  return {
    id: String(entry.id),
    name: entry.name || '',
    description: entry.description || '',
    item_count: Number(entry.item_count) || 0,
    likes: Number(entry.likes) || 0,
    user: entry.user || null,
  }
}

// Las listas del índice «personal» son SIEMPRE del usuario: se pueden editar.
export function personalListPreviewFromIndex(entry) {
  if (!entry?.id) return null
  return {
    id: entry.id,
    name: entry.name || '',
    description: entry.description || '',
    public: Boolean(entry.public),
    canEdit: true,
    item_count: Number(entry.item_count) || 0,
    page: 1,
    total_pages: 1,
    items: [],
    ratingSummary: null,
  }
}

// Claves de la caché de cada ficha de lista (sessionStorage, {t, data}).
// Las comparten las fichas y la precarga desde el índice
// (lib/lists/detailsPrefetch), que escribe exactamente lo que ellas leen.
export function getCollectionDetailsCacheKey(collectionId) {
  return collectionId ? `showverse:list-details:collection:${collectionId}:v2` : null;
}

export function getPersonalListDetailsCacheKey(listId) {
  return listId ? `showverse:list-details:tmdb:${listId}:v1` : null;
}

export const LIST_DETAILS_CACHE_TTL_MS = {
  collection: 30 * 60 * 1000,
  community: 20 * 60 * 1000,
  personal: 20 * 60 * 1000,
};

/**
 * Ruta interna de una ficha de lista → { source, id }, o null si no lo es:
 *   /lists/collection/:id → collections · /lists/community/:id → trakt ·
 *   /lists/:id → personal (las fuentes del índice de /lists).
 */
export function listDetailsTargetFromHref(href) {
  const path = String(href || '').split(/[?#]/)[0]
  let match = path.match(/^\/lists\/collection\/([^/]+)$/)
  if (match) return { source: 'collections', id: decodeURIComponent(match[1]) }
  match = path.match(/^\/lists\/community\/([^/]+)$/)
  if (match) return { source: 'trakt', id: decodeURIComponent(match[1]) }
  match = path.match(/^\/lists\/([^/]+)$/)
  if (match && match[1] !== 'collection' && match[1] !== 'community') {
    return { source: 'personal', id: decodeURIComponent(match[1]) }
  }
  return null
}
