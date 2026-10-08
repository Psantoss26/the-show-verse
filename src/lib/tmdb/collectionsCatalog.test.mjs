import assert from "node:assert/strict";
import test from "node:test";

import { catalogPage, normalizeCatalogSort } from "./collectionsCatalog.js";

const entries = [
  [10, "La guerra de las galaxias", 9, 150_000],
  [1241, "Harry Potter", 8, 180_000],
  [645, "James Bond", 27, 115_000],
  [656, "Saw", 10, 40_000],
  [9, "Ábaco", 2, 10],
];

test("pagina el catálogo sin las destacadas", () => {
  const first = catalogPage(entries, { sort: "likes_desc", pageSize: 2, exclude: ["1241"] });
  assert.deepEqual(first.entries.map((e) => e[0]), [10, 645]);
  assert.equal(first.total, 4);
  assert.equal(first.totalPages, 2);
  const second = catalogPage(entries, { sort: "likes_desc", page: 2, pageSize: 2, exclude: [1241] });
  assert.deepEqual(second.entries.map((e) => e[0]), [656, 9]);
  // Fuera de rango: la última página.
  assert.equal(catalogPage(entries, { page: 99, pageSize: 2 }).page, 3);
});

test("ordena con los criterios del menú de /lists", () => {
  const ids = (sort) => catalogPage(entries, { sort }).entries.map((e) => e[0]);
  assert.deepEqual(ids("items_desc"), [645, 656, 10, 1241, 9]);
  assert.deepEqual(ids("items_asc"), [9, 1241, 10, 656, 645]);
  // Nombre en español: «Ábaco» va con la A.
  assert.deepEqual(ids("name_asc"), [9, 1241, 645, 10, 656]);
  assert.equal(normalizeCatalogSort("otro"), "items_desc");
});

test("no muta la entrada", () => {
  const copy = JSON.parse(JSON.stringify(entries));
  catalogPage(entries, { sort: "name_desc" });
  assert.deepEqual(entries, copy);
});
