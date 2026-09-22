import test from "node:test";
import assert from "node:assert/strict";
import { buildSearchHref, paginationWindow } from "./searchPage.js";

test("la URL omite tipo y página por defecto", () => {
  assert.equal(buildSearchHref({ q: " dune " }), "/search?q=dune");
  assert.equal(
    buildSearchHref({ q: "dune", type: "movies", page: 3 }),
    "/search?q=dune&type=movies&page=3",
  );
  assert.equal(buildSearchHref({ q: "dune", type: "raro" }), "/search?q=dune");
});

test("la ventana de páginas enseña extremos, vecinas y huecos", () => {
  assert.deepEqual(paginationWindow(1, 1), [1]);
  assert.deepEqual(paginationWindow(1, 4), [1, 2, 3, 4]);
  assert.deepEqual(paginationWindow(7, 20), [1, "gap", 5, 6, 7, 8, 9, "gap", 20]);
  assert.deepEqual(paginationWindow(20, 20), [1, "gap", 18, 19, 20]);
  assert.deepEqual(paginationWindow(3, 0), []);
});
