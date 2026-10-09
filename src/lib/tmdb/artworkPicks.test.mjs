import assert from "node:assert/strict";
import test from "node:test";

import { artworkItemKey, pickListArtwork } from "./artworkPicks.js";

test("claves de título normalizadas", () => {
  assert.equal(artworkItemKey("tv", "1399"), "tv:1399");
  assert.equal(artworkItemKey("movie", 603), "movie:603");
  assert.equal(artworkItemKey("show", 1), "movie:1");
  assert.equal(artworkItemKey("movie", "x"), null);
  assert.equal(artworkItemKey("movie", -1), null);
});

test("sin respuesta de TMDb no hay elección (null, no «sin póster»)", () => {
  assert.equal(pickListArtwork(null), null);
  assert.deepEqual(pickListArtwork({ posters: [], backdrops: [] }), { poster: null, previewPoster: null, previewBackdrop: null, coverPoster: null });
});

test("elige póster inglés y backdrop con idioma", () => {
  const images = {
    posters: [
      { file_path: "/es.jpg", iso_639_1: "es", width: 2000, height: 3000, vote_average: 9, vote_count: 9 },
      { file_path: "/en.jpg", iso_639_1: "en", width: 2000, height: 3000, vote_average: 5, vote_count: 5 },
    ],
    backdrops: [{ file_path: "/bd-en.jpg", iso_639_1: "en", width: 1920, height: 1080 }],
  };
  const picks = pickListArtwork(images);
  assert.equal(picks.poster, "/en.jpg");
  assert.equal(picks.previewPoster, "/en.jpg");
  assert.equal(picks.previewBackdrop, "/bd-en.jpg");
});

test("la portada de los mosaicos usa arte SIN texto", () => {
  const titled = { file_path: "/en.jpg", iso_639_1: "en", width: 2000, height: 3000, vote_count: 50 };
  const textless = { file_path: "/null.jpg", iso_639_1: null, width: 1000, height: 1500, vote_count: 1 };
  const xx = { file_path: "/xx.jpg", iso_639_1: "xx", width: 2000, height: 3000, vote_count: 1 };
  const neutralBackdrop = { file_path: "/bd.jpg", iso_639_1: null, width: 3840, height: 2160 };
  const englishBackdrop = { file_path: "/bd-en.jpg", iso_639_1: "en", width: 3840, height: 2160 };

  // El mejor póster sin texto (más resolución), con "xx" como sin idioma.
  assert.equal(pickListArtwork({ posters: [titled, textless, xx], backdrops: [] }).coverPoster, "/xx.jpg");
  // Sin pósters sin texto: el backdrop sin texto, nunca uno con idioma.
  assert.equal(pickListArtwork({ posters: [titled], backdrops: [englishBackdrop, neutralBackdrop] }).coverPoster, "/bd.jpg");
  // Sin nada sin texto: el póster inglés.
  assert.equal(pickListArtwork({ posters: [titled], backdrops: [englishBackdrop] }).coverPoster, "/en.jpg");
});
