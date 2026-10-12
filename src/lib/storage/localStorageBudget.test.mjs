import assert from "node:assert/strict";
import test from "node:test";

import {
  setLocalStorageItem,
  sweepLocalStorageOnStartup,
} from "./localStorageBudget.js";

// localStorage en memoria con techo de cuota (en caracteres, como se cuenta en
// el módulo: clave + valor).
function installStorage(initial = {}, quota = Infinity) {
  const store = new Map(Object.entries(initial));
  const used = () =>
    [...store].reduce((sum, [k, v]) => sum + k.length + v.length, 0);
  globalThis.window = {
    localStorage: {
      get length() {
        return store.size;
      },
      key: (i) => [...store.keys()][i] ?? null,
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => {
        const prev = store.get(k);
        const next = used() - (prev ? k.length + prev.length : 0) + k.length + String(v).length;
        if (next > quota) {
          const error = new Error("quota");
          error.name = "QuotaExceededError";
          throw error;
        }
        store.set(k, String(v));
      },
      removeItem: (k) => store.delete(k),
    },
  };
  return store;
}

const SCORES_KEY = "showverse:scores:imdb:v2";
const DAY = 24 * 60 * 60 * 1000;

test("la barrida de arranque no tira la caché de notas de las listas", () => {
  const now = Date.now();
  // La caché de notas lleva la fecha de su entrada MÁS ANTIGUA al principio,
  // así que para el desalojo «por antigüedad» parece lo más viejo de todo.
  const scores = JSON.stringify({
    "movie:603": { score: 8.7, t: now - 20 * DAY },
    "tv:1396": { score: 9.5, t: now },
  });
  const big = "x".repeat(2.2 * 1024 * 1024);
  const store = installStorage({
    [SCORES_KEY]: scores,
    "showverse:dashboard:engine:v5:home:anon": `{"ts":${now - DAY},"d":"${big}"}`,
    "showverse:dashboard:engine:v5:series:anon": `{"ts":${now},"d":"${big}"}`,
  });

  sweepLocalStorageOnStartup();

  assert.equal(store.get(SCORES_KEY), scores);
  assert.equal(store.has("showverse:dashboard:engine:v5:home:anon"), false);
});

test("al llenarse el almacenamiento se hace sitio sin tirar la caché de notas", () => {
  const now = Date.now();
  const scores = JSON.stringify({
    "movie:603": { score: 8.7, t: now - 20 * DAY },
  });
  const store = installStorage(
    {
      [SCORES_KEY]: scores,
      "showverse:omdb:tt0133093": `{"t":${now - DAY},"d":"${"x".repeat(2000)}"}`,
    },
    3000,
  );

  const ok = setLocalStorageItem("showverse:jw:movie:1", "y".repeat(1500));

  assert.equal(ok, true);
  assert.equal(store.get(SCORES_KEY), scores);
  assert.equal(store.has("showverse:omdb:tt0133093"), false);
});
