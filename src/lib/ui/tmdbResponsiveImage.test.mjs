import assert from "node:assert/strict";
import test from "node:test";

import {
  shouldGrowTmdbSizes,
  tmdbPosterSrcSet,
  tmdbPosterUrlAt,
  tmdbPosterWidthFor,
} from "./tmdbResponsiveImage.js";

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

test("elige el tamaño de TMDb más pequeño que cubre el ancho", () => {
  assert.equal(tmdbPosterWidthFor(172, 1), 185);
  assert.equal(tmdbPosterWidthFor(246, 1), 342);
  assert.equal(tmdbPosterWidthFor(246, 2), 500);
  assert.equal(tmdbPosterWidthFor(600, 2), 780);
});

test("solo reescribe `sizes` para crecer a un tamaño de TMDb mayor", () => {
  // Encoger (panel lateral acoplado) no toca la imagen ya pintada.
  assert.equal(shouldGrowTmdbSizes(246, 172, 1), false);
  // Crecer dentro del mismo tamaño de TMDb, tampoco.
  assert.equal(shouldGrowTmdbSizes(200, 300, 1), false);
  // Crecer a uno mayor, sí.
  assert.equal(shouldGrowTmdbSizes(172, 246, 1), true);
  // Sin `sizes` previo siempre se escribe.
  assert.equal(shouldGrowTmdbSizes(0, 172, 1), true);
});

test("construye la URL de un tamaño concreto", () => {
  assert.equal(
    tmdbPosterUrlAt("https://image.tmdb.org/t/p/w342/abc.jpg", 500),
    "https://image.tmdb.org/t/p/w500/abc.jpg",
  );
  assert.equal(tmdbPosterUrlAt("/placeholder.png", 500), null);
});
