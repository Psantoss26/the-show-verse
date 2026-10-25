// Fechas de visionado de Favoritos («Vista reciente» / «Vista antigua»).
//
// Salen de `/api/trakt/history` (el historial ENTERO), que llega bastante
// después que la lista. Sin una copia local, al entrar las tarjetas se pintaban
// en orden de «Añadido» y se recolocaban con la animación al llegar el
// historial, cuando el resto de órdenes (título, añadido, notas IMDb en caché)
// ya entran fijos. Se guarda solo lo que usa la página: la última fecha y el
// número de visionados por título, de la cuenta actual.

import { setLocalStorageItem } from "../storage/localStorageBudget.js";

export const WATCH_HISTORY_CACHE_KEY = "showverse:favorites:watch-history:v1";
// Más allá de esto la copia ya no representa el historial: se descarta y la
// página espera a la respuesta real antes de pintar en orden de visionado.
export const WATCH_HISTORY_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function isWatchedSort(sortBy) {
  return sortBy === "watched-desc" || sortBy === "watched-asc";
}

// Respuesta de `/api/trakt/history` → mapas `show|movie:tmdbId` → última fecha
// y número de visionados.
export function buildWatchHistoryMaps(entries) {
  const watchDates = new Map();
  const watchCounts = new Map();

  for (const entry of Array.isArray(entries) ? entries : []) {
    const watchedAt = entry?.watched_at;
    if (!watchedAt) continue;
    const key = `${entry.type}:${entry.tmdbId}`;

    watchCounts.set(key, (watchCounts.get(key) || 0) + 1);
    const previous = watchDates.get(key);
    if (!previous || new Date(watchedAt) > new Date(previous)) {
      watchDates.set(key, watchedAt);
    }
  }

  return { watchDates, watchCounts };
}

// Clave del historial para un título de la lista (Trakt dice «show», TMDb «tv»).
export function getWatchHistoryKey(item) {
  const type = item?.media_type || (item?.title ? "movie" : "tv");
  return `${type === "tv" ? "show" : type}:${item?.id}`;
}

// Orden por visionado: los títulos sin fecha van al final en ambos sentidos.
export function sortByWatchDate(items, watchDates, direction = "desc") {
  const sign = direction === "asc" ? -1 : 1;
  return [...items].sort((a, b) => {
    const dateA = watchDates.get(getWatchHistoryKey(a));
    const dateB = watchDates.get(getWatchHistoryKey(b));
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;
    return sign * (new Date(dateB) - new Date(dateA));
  });
}

// Sin copia local ni historial cargado, el orden por visionado aún no existe:
// la lista espera en vez de pintarse en otro orden y recolocarse después.
export function shouldWaitForWatchHistory({
  sortBy,
  hasCachedHistory,
  historyLoaded,
}) {
  return isWatchedSort(sortBy) && !hasCachedHistory && !historyLoaded;
}

// `null` = no hay copia válida para esta cuenta (la página no sabe el orden).
export function readWatchHistoryCache({ owner, now = Date.now() } = {}) {
  if (typeof window === "undefined" || owner == null) return null;
  try {
    const raw = window.localStorage.getItem(WATCH_HISTORY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (String(parsed?.owner) !== String(owner)) return null;
    if (!(now - Number(parsed.t) < WATCH_HISTORY_CACHE_MAX_AGE_MS)) return null;
    if (!Array.isArray(parsed.dates) || !Array.isArray(parsed.counts)) {
      return null;
    }
    return {
      watchDates: new Map(parsed.dates),
      watchCounts: new Map(parsed.counts),
    };
  } catch {
    return null;
  }
}

export function writeWatchHistoryCache(
  { watchDates, watchCounts },
  { owner, now = Date.now() } = {},
) {
  if (typeof window === "undefined" || owner == null) return;
  setLocalStorageItem(
    WATCH_HISTORY_CACHE_KEY,
    JSON.stringify({
      t: now,
      owner: String(owner),
      dates: [...watchDates],
      counts: [...watchCounts],
    }),
  );
}
