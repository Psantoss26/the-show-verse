import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const englishPosterItems = readFileSync(
  new URL("../tmdb/useEnglishPosterItems.js", import.meta.url),
  "utf8",
);
const listDetailsTools = readFileSync(
  new URL("../../components/lists/ListDetailsTools.jsx", import.meta.url),
  "utf8",
);
const listPosterCard = readFileSync(
  new URL("../../components/lists/ListPosterCard.jsx", import.meta.url),
  "utf8",
);

test("las parrillas de listas no revelan el artwork persistido durante la resolución inglesa", () => {
  assert.match(listDetailsTools, /hideOriginalPosters: true/);
  assert.match(englishPosterItems, /poster_path: null/);
  assert.match(englishPosterItems, /backdrop_path: null/);
  assert.match(englishPosterItems, /_englishPosterPending: !resolved/);
});

test("las tarjetas usan un placeholder neutro hasta que llega el póster inglés", () => {
  assert.match(listPosterCard, /function TmdbPoster\(\{ posterPath, alt, loading = false \}\)/);
  assert.match(listPosterCard, /animate-pulse bg-zinc-900/);
  assert.match(listPosterCard, /loading=\{posterLoading\}/);
});
