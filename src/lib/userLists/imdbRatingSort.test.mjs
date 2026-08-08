import assert from "node:assert/strict";
import test from "node:test";

import { compareImdbRatings } from "./imdbRatingSort.js";

test("ordena únicamente por IMDb en orden descendente", () => {
  const items = [
    { id: "a", imdb: 7.2 },
    { id: "b", imdb: 9.1 },
    { id: "c", imdb: 8.4 },
  ];

  items.sort((a, b) => compareImdbRatings(a.imdb, b.imdb, "desc"));
  assert.deepEqual(items.map((item) => item.id), ["b", "c", "a"]);
});

test("ordena únicamente por IMDb en orden ascendente", () => {
  const items = [
    { id: "a", imdb: 7.2 },
    { id: "b", imdb: 9.1 },
    { id: "c", imdb: 8.4 },
  ];

  items.sort((a, b) => compareImdbRatings(a.imdb, b.imdb, "asc"));
  assert.deepEqual(items.map((item) => item.id), ["a", "c", "b"]);
});

test("mantiene al final los títulos sin IMDb en ambos sentidos", () => {
  const values = [null, 0, undefined, Number.NaN];

  for (const direction of ["asc", "desc"]) {
    for (const missing of values) {
      assert.equal(compareImdbRatings(missing, 7.5, direction), 1);
      assert.equal(compareImdbRatings(7.5, missing, direction), -1);
      assert.equal(compareImdbRatings(missing, null, direction), 0);
    }
  }
});
