import assert from "node:assert/strict";
import test from "node:test";

import { getUserDetailsSequenceHref } from "./userDetailsSequence.js";
import { readFile } from "node:fs/promises";

test("getUserDetailsSequenceHref only accepts root DetailsClient routes", () => {
  assert.equal(getUserDetailsSequenceHref("movie", 550), "/details/movie/550");
  assert.equal(getUserDetailsSequenceHref("tv", "1399"), "/details/tv/1399");
  assert.equal(getUserDetailsSequenceHref("episode", 1), null);
});

test("la secuencia puede tomar el contenedor completo de una página personal", async () => {
  const source = await readFile(new URL("./userDetailsSequence.js", import.meta.url), "utf8");

  assert.match(source, /saveUserDetailsSequenceFromLink\(link, sequenceScope = null\)/);
  assert.match(source, /sequenceScope instanceof Element && !sequenceScope\.contains\(link\)\) return/);
});

test("la secuencia solo toma la pantalla activa, no las que siguen vivas ocultas", async () => {
  const source = await readFile(new URL("./userDetailsSequence.js", import.meta.url), "utf8");

  assert.match(source, /function narrowToScreen\(scope, link\)/);
  assert.match(source, /const scope = narrowToScreen\(baseScope, link\)/);
  assert.match(source, /if \(!isRenderedLink\(link\)\) continue/);
});

test("Favoritos y Pendientes publican su orden completo, no solo las tarjetas montadas", async () => {
  for (const page of ["../../app/favorites/FavoritesClient.jsx", "../../app/watchlist/WatchlistClient.jsx"]) {
    const source = await readFile(new URL(page, import.meta.url), "utf8");
    assert.match(source, /useUserDetailsSequenceSource\(detailsSequenceHrefs\)/);
    assert.match(source, /ref=\{detailsSequenceRef\}\s+data-user-details-sequence/);
  }
});

test("FeaturedHero: guardar su orden y olvidarlo al abrir otro título", async () => {
  const store = new Map();
  globalThis.window = {
    sessionStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
  };
  try {
    const { saveUserDetailsSequence, getUserDetailsSequence, clearUserDetailsSequence } =
      await import("./userDetailsSequence.js");
    const hero = ["/details/movie/1", "/details/tv/2", "/details/movie/3"];
    assert.equal(saveUserDetailsSequence(hero, "/details/tv/2"), true);
    assert.deepEqual(getUserDetailsSequence("/details/tv/2"), {
      previous: "/details/movie/1",
      next: "/details/movie/3",
    });
    clearUserDetailsSequence();
    assert.equal(getUserDetailsSequence("/details/tv/2"), null);
  } finally {
    delete globalThis.window;
  }

  const hero = await readFile(new URL("../../components/FeaturedHero.jsx", import.meta.url), "utf8");
  assert.match(hero, /sequence: list\.map\(\(entry\) => dashboardDetailHref\(entry\)\)/);
  const provider = await readFile(new URL("../../components/dashboard/DetailModalProvider.jsx", import.meta.url), "utf8");
  assert.match(provider, /saveUserDetailsSequence\(opts\.sequence, dashboardDetailHref\(item\)\)/);
  assert.match(provider, /placementSwitchable && opts\.push !== false && !opts\.drill[\s\S]{0,400}clearUserDetailsSequence\(\)/);
});
