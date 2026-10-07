import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import {
  SCORE_CACHE_MISSING_TTL_MS,
  fetchImdbScoresForItems,
  readScoreCache,
  readScoreCacheEntries,
  resolveImdbBatch,
  shouldRefreshScore,
  writeScoreCache,
} from "./listScoreCache.js";

const KEY = "showverse:scores:imdb:v2";

function installStorage(initial = {}) {
  const store = new Map(
    Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]),
  );
  globalThis.window = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    },
  };
  return store;
}

beforeEach(() => {
  installStorage();
});

test("un «sin nota» confirmado se guarda marcado y se lee como negativo", () => {
  writeScoreCache("imdb", new Map([["movie:1", null], ["movie:2", 8.1]]));

  const stored = JSON.parse(window.localStorage.getItem(KEY));
  assert.equal(stored["movie:1"].none, true);
  assert.equal(stored["movie:2"].none, undefined);

  const cache = readScoreCache("imdb");
  assert.equal(cache.get("movie:1"), null);
  assert.equal(cache.get("movie:2"), 8.1);
});

test("los negativos antiguos sin confirmar se ignoran para volver a pedirlos", () => {
  const now = Date.now();
  installStorage({
    [KEY]: {
      "movie:1": { score: null, t: now },
      "movie:2": { score: null, t: now, none: true },
      "movie:3": { score: 7.4, t: now },
    },
  });

  const entries = readScoreCacheEntries("imdb");
  assert.equal(entries.has("movie:1"), false);
  assert.equal(entries.get("movie:2").score, null);
  assert.equal(entries.get("movie:3").score, 7.4);
});

test("un negativo confirmado se vuelve a comprobar pasado un día", () => {
  const now = Date.now();
  const item = { id: 1, title: "x" };
  assert.equal(shouldRefreshScore(item, { score: null, t: now }, now), false);
  assert.equal(
    shouldRefreshScore(
      item,
      { score: null, t: now - SCORE_CACHE_MISSING_TTL_MS },
      now,
    ),
    true,
  );
  assert.equal(shouldRefreshScore(item, undefined, now), true);
});

test("un lote distingue notas, «sin nota» y títulos sin resolver", () => {
  const batch = [
    { id: 1, title: "con nota" },
    { id: 2, title: "sin nota" },
    { id: 3, title: "falló" },
  ];
  const { resolved, failed } = resolveImdbBatch(batch, {
    items: { "movie:1": { rating: 8.3 } },
    unresolved: new Set(["movie:3"]),
  });

  assert.deepEqual([...resolved], [
    ["movie:1", 8.3],
    ["movie:2", null],
  ]);
  assert.deepEqual(
    failed.map((item) => item.id),
    [3],
  );
});

test("si la petición entera falla no se da nada por «sin nota»", () => {
  const batch = [{ id: 1, title: "a" }, { id: 2, name: "b" }];
  const { resolved, failed } = resolveImdbBatch(batch, null);
  assert.equal(resolved.size, 0);
  assert.equal(failed.length, 2);
});

test("un lote sin claves válidas devuelve la forma esperada sin pedir nada", async () => {
  const result = await fetchImdbScoresForItems([{ title: "sin id" }]);
  assert.deepEqual(result.items, {});
  assert.equal(result.unresolved.size, 0);
});
