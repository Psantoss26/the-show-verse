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

test("la popularidad de una colección es la media de la de sus películas", async () => {
  const { collectionPopularity, toCollectionSummary } = await import("./featuredCollections.js");
  assert.equal(collectionPopularity([{ popularity: 10 }, { popularity: 20 }, { popularity: 31 }]), 20.3);
  // Sin dato no cuenta; sin películas, 0.
  assert.equal(collectionPopularity([{ popularity: 12 }, {}, { popularity: null }]), 12);
  assert.equal(collectionPopularity([]), 0);
  assert.equal(collectionPopularity(undefined), 0);
  // Una saga larga y poco vista hoy no supera a una corta y muy vista.
  const bond = collectionPopularity(Array.from({ length: 27 }, () => ({ popularity: 14 })));
  const avengers = collectionPopularity([{ popularity: 99 }, { popularity: 60 }, { popularity: 44 }]);
  assert.ok(avengers > bond);
  assert.equal(toCollectionSummary({ id: 1, name: "X", parts: [{ popularity: 5 }, { popularity: 7 }] }).popularity, 6);
});
