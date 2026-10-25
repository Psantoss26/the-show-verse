import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import {
  WATCH_HISTORY_CACHE_KEY,
  WATCH_HISTORY_CACHE_MAX_AGE_MS,
  buildWatchHistoryMaps,
  readWatchHistoryCache,
  shouldWaitForWatchHistory,
  sortByWatchDate,
  writeWatchHistoryCache,
} from "./watchHistoryCache.js";

let store;

beforeEach(() => {
  store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      key: (i) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    },
  };
});

const HISTORY = [
  { type: "movie", tmdbId: 1, watched_at: "2026-01-10T20:00:00Z" },
  { type: "show", tmdbId: 2, watched_at: "2026-03-01T20:00:00Z" },
  { type: "movie", tmdbId: 1, watched_at: "2026-02-15T20:00:00Z" },
  { type: "movie", tmdbId: 3, watched_at: null },
];

// Orden de «Añadido»: el que se veía antes de llegar el historial.
const FAVORITES = [
  { id: 4, title: "Nunca vista", media_type: "movie" },
  { id: 1, title: "Película", media_type: "movie" },
  { id: 2, name: "Serie", media_type: "tv" },
];

const ids = (items) => items.map((item) => item.id);

test("el historial da la última fecha y el número de visionados por título", () => {
  const { watchDates, watchCounts } = buildWatchHistoryMaps(HISTORY);
  assert.equal(watchDates.get("movie:1"), "2026-02-15T20:00:00Z");
  assert.equal(watchCounts.get("movie:1"), 2);
  assert.equal(watchDates.get("show:2"), "2026-03-01T20:00:00Z");
  assert.equal(watchDates.has("movie:3"), false);
});

test("con la copia local la lista sale ordenada por visionado sin esperar a la red", () => {
  writeWatchHistoryCache(buildWatchHistoryMaps(HISTORY), { owner: "7" });

  // Siguiente visita: el primer render solo tiene la copia local.
  const cached = readWatchHistoryCache({ owner: "7" });
  assert.ok(cached);
  assert.equal(
    shouldWaitForWatchHistory({
      sortBy: "watched-desc",
      hasCachedHistory: true,
      historyLoaded: false,
    }),
    false,
  );
  assert.deepEqual(ids(sortByWatchDate(FAVORITES, cached.watchDates, "desc")), [2, 1, 4]);
  assert.deepEqual(ids(sortByWatchDate(FAVORITES, cached.watchDates, "asc")), [1, 2, 4]);
  assert.equal(cached.watchCounts.get("movie:1"), 2);
});

test("sin copia, los órdenes por visionado esperan al historial; el resto no", () => {
  const base = { hasCachedHistory: false, historyLoaded: false };
  assert.equal(shouldWaitForWatchHistory({ ...base, sortBy: "watched-desc" }), true);
  assert.equal(shouldWaitForWatchHistory({ ...base, sortBy: "watched-asc" }), true);
  for (const sortBy of ["added-desc", "added-asc", "title-asc", "rating-desc"]) {
    assert.equal(shouldWaitForWatchHistory({ ...base, sortBy }), false);
  }
  assert.equal(
    shouldWaitForWatchHistory({ ...base, sortBy: "watched-desc", historyLoaded: true }),
    false,
  );
});

test("la copia solo vale para la misma cuenta y mientras no caduca", () => {
  const now = Date.parse("2026-10-24T12:00:00Z");
  writeWatchHistoryCache(buildWatchHistoryMaps(HISTORY), { owner: "7", now });

  assert.equal(readWatchHistoryCache({ owner: "8", now }), null);
  assert.equal(readWatchHistoryCache({ owner: null, now }), null);
  assert.ok(readWatchHistoryCache({ owner: "7", now: now + 1000 }));
  assert.equal(
    readWatchHistoryCache({ owner: "7", now: now + WATCH_HISTORY_CACHE_MAX_AGE_MS }),
    null,
  );

  store.set(WATCH_HISTORY_CACHE_KEY, "{roto");
  assert.equal(readWatchHistoryCache({ owner: "7", now }), null);
});
