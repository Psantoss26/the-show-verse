import assert from "node:assert/strict";
import test from "node:test";

import { tmdbPosterSrcSet } from "./tmdbResponsiveImage.js";

test("genera el srcset de TMDb con todos los tamaños de póster", () => {
  assert.equal(
    tmdbPosterSrcSet("https://image.tmdb.org/t/p/w780/abc.jpg"),
    "https://image.tmdb.org/t/p/w185/abc.jpg 185w, https://image.tmdb.org/t/p/w342/abc.jpg 342w, https://image.tmdb.org/t/p/w500/abc.jpg 500w, https://image.tmdb.org/t/p/w780/abc.jpg 780w",
  );
  assert.match(tmdbPosterSrcSet("https://image.tmdb.org/t/p/original/x.png"), /w185\/x\.png 185w/);
});

test("no toca imágenes que no son de TMDb", () => {
  assert.equal(tmdbPosterSrcSet("/placeholder.png"), null);
  assert.equal(tmdbPosterSrcSet(""), null);
  assert.equal(tmdbPosterSrcSet(null), null);
});
