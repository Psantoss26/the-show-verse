import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import {
  SCORE_CACHE_MAX_AGE_MS,
  SCORE_CACHE_MISSING_TTL_MS,
  SCORE_CACHE_TTL_MS,
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

test("dos modales comparten el lote en curso aunque cambie el orden", async (t) => {
  let finish;
  let calls = 0;
  t.mock.method(globalThis, "fetch", () => {
    calls += 1;
    return new Promise((resolve) => { finish = resolve; });
  });
  const items = [{ id: 101, media_type: "movie" }, { id: 102, media_type: "tv" }];
  const first = fetchImdbScoresForItems(items);
  const reopened = fetchImdbScoresForItems([...items].reverse());
  assert.equal(calls, 1);
  finish({ ok: true, json: async () => ({ items: { "movie:101": { rating: 8 } } }) });
  const [a, b] = await Promise.all([first, reopened]);
  assert.equal(a.items["movie:101"].rating, 8);
  assert.deepEqual(a, b);
});

test("un fallo de red no bloquea el siguiente intento del lote", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    if (++calls === 1) throw new Error("network");
    return { ok: true, json: async () => ({ items: {} }) };
  });
  const items = [{ id: 103, media_type: "movie" }];
  await assert.rejects(fetchImdbScoresForItems(items), /network/);
  const result = await fetchImdbScoresForItems(items);
  assert.equal(calls, 2);
  assert.deepEqual(result.items, {});
});

test("una nota caducada de un título antiguo se sigue leyendo (y se marca para refrescar)", () => {
  const now = Date.now();
  const item = { id: 7, title: "antigua", release_date: "1999-03-31" };
  const writtenAt = now - SCORE_CACHE_TTL_MS - 24 * 60 * 60 * 1000;
  installStorage({ [KEY]: { "movie:7": { score: 8.7, t: writtenAt } } });

  // Si desapareciera, el título se pintaría al final de su grupo y saltaría a
  // su sitio al llegar la nota: la lista se reordenaría al entrar.
  const entries = readScoreCacheEntries("imdb", now);
  assert.equal(entries.get("movie:7")?.score, 8.7);
  assert.equal(shouldRefreshScore(item, entries.get("movie:7"), now), true);
});

test("las entradas demasiado viejas sí se descartan al leer y al escribir", () => {
  const now = Date.now();
  installStorage({
    [KEY]: { "movie:7": { score: 8.7, t: now - SCORE_CACHE_MAX_AGE_MS } },
  });
  assert.equal(readScoreCacheEntries("imdb", now).has("movie:7"), false);

  writeScoreCache("imdb", new Map([["movie:8", 6.1]]));
  const stored = JSON.parse(window.localStorage.getItem(KEY));
  assert.equal(stored["movie:7"], undefined);
  assert.equal(stored["movie:8"].score, 6.1);
});
