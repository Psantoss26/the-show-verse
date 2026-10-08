import assert from "node:assert/strict";
import test from "node:test";

import { formatStatNumber, listsHeaderStats } from "./headerStats.js";

const values = (stats) => Object.fromEntries(stats.map((stat) => [stat.label, stat.value]));

test("tres tarjetas por pestaña", () => {
  for (const source of ["personal", "trakt", "collections"]) {
    assert.equal(listsHeaderStats(source, []).length, 3);
  }
});

test("Mis listas: listas, títulos y públicas", () => {
  const stats = listsHeaderStats("personal", [
    { item_count: 4, public: true },
    { item_count: 10, public: false },
  ]);
  assert.deepEqual(values(stats), { Listas: "2", "Títulos": "14", "Públicas": "1" });
});

test("Comunidad: suma títulos y me gusta", () => {
  const stats = listsHeaderStats("trakt", [
    { item_count: 1523, likes: 1100 },
    { item_count: 100, likes: 25_000 },
  ]);
  // En español, sin separador hasta las cinco cifras (1623, 12.340).
  assert.deepEqual(values(stats), { Listas: "2", "Títulos": "1623", "Me gusta": "26,1k" });
});

test("Colecciones: sagas, películas y media por saga", () => {
  const stats = listsHeaderStats("collections", [{ item_count: 9 }, { item_count: 8 }, { item_count: 3 }]);
  assert.deepEqual(values(stats), { Sagas: "3", "Películas": "20", "Media por saga": "6,7" });
  assert.equal(values(listsHeaderStats("collections", []))["Media por saga"], "0");
});

test("números que caben en la tarjeta", () => {
  assert.equal(formatStatNumber(9999), "9999");
  assert.equal(formatStatNumber(12_340), "12,3k");
  assert.equal(formatStatNumber(2_400_000), "2,4M");
  assert.equal(formatStatNumber(undefined), "0");
});
