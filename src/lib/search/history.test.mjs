import assert from "node:assert/strict";
import test from "node:test";

import {
  SEARCH_HISTORY_LIMIT,
  addSearchHistory,
  clearSearchHistory,
  readSearchHistory,
  removeSearchHistory,
} from "./history.js";

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("new searches are stored first and equivalent queries are deduplicated", () => {
  const storage = createStorage();

  addSearchHistory("  Stranger   Things  ", storage);
  addSearchHistory("Dark", storage);
  addSearchHistory("stránger things", storage);

  assert.deepEqual(readSearchHistory(storage), ["stránger things", "Dark"]);
});

test("search history is capped at the configured limit", () => {
  const storage = createStorage();

  for (let index = 0; index < SEARCH_HISTORY_LIMIT + 3; index += 1) {
    addSearchHistory(`Consulta ${index}`, storage);
  }

  assert.equal(readSearchHistory(storage).length, SEARCH_HISTORY_LIMIT);
  assert.equal(readSearchHistory(storage)[0], "Consulta 10");
});

test("individual and full removal update persisted history", () => {
  const storage = createStorage();

  addSearchHistory("Alien", storage);
  addSearchHistory("Blade Runner", storage);
  assert.deepEqual(removeSearchHistory("alien", storage), ["Blade Runner"]);
  assert.deepEqual(clearSearchHistory(storage), []);
  assert.deepEqual(readSearchHistory(storage), []);
});

test("session history survives when browser storage rejects writes", () => {
  const storage = {
    getItem: () => null,
    setItem: () => {
      throw new Error("storage disabled");
    },
    removeItem: () => {
      throw new Error("storage disabled");
    },
  };

  assert.deepEqual(addSearchHistory("Arrival", storage), ["Arrival"]);
  assert.deepEqual(readSearchHistory(storage), ["Arrival"]);
});
