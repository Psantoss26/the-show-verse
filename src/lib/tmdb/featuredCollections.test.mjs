import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { FEATURED_COLLECTION_IDS, FEATURED_MIN_VOTES, cleanCollectionName } from "./featuredCollections.js";

const catalog = JSON.parse(
  await readFile(new URL("../../data/tmdbCollectionsCatalog.json", import.meta.url), "utf8"),
);
const byId = new Map(catalog.collections.map((entry) => [entry[0], entry]));

test("solo sagas conocidas: todas superan el umbral de votos de TMDb", () => {
  const unknown = FEATURED_COLLECTION_IDS.filter((id) => (byId.get(id)?.[3] ?? 0) < FEATURED_MIN_VOTES)
    .map((id) => `${id} ${byId.get(id)?.[1] ?? "(no está en el catálogo)"}`);
  assert.deepEqual(unknown, []);
});

test("sin colecciones repetidas", () => {
  assert.equal(new Set(FEATURED_COLLECTION_IDS).size, FEATURED_COLLECTION_IDS.length);
});

test("nombre del índice sin el sufijo de colección", () => {
  assert.equal(cleanCollectionName("Harry Potter - Colección"), "Harry Potter");
  assert.equal(cleanCollectionName("Star Wars Collection"), "Star Wars");
});
