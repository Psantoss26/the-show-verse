import assert from "node:assert/strict";
import test from "node:test";
import { activityBackdropTarget, activityBackdropSrc, hasActivityBackdropArtwork } from "./activityBackdrops.js";

test("las acciones sobre un título apuntan a su ficha de TMDb", () => {
  assert.deepEqual(activityBackdropTarget({ type: "watched", mediaType: "movie", tmdbId: 550 }), { mediaType: "movie", tmdbId: 550 });
  // Episodios, temporadas y series comparten el backdrop de la serie.
  for (const mediaType of ["tv", "show", "season", "episode"]) {
    assert.deepEqual(activityBackdropTarget({ type: "watched", mediaType, tmdbId: "1399" }), { mediaType: "tv", tmdbId: 1399 });
  }
  assert.deepEqual(activityBackdropTarget({ type: "like_review", mediaType: "tv", tmdbId: 1396 }), { mediaType: "tv", tmdbId: 1396 });
});

test("listas y colecciones no tienen ficha de título: sin backdrop", () => {
  assert.equal(activityBackdropTarget({ type: "list", id: "list:3" }), null);
  assert.equal(activityBackdropTarget({ type: "like_list", listId: 3 }), null);
  assert.equal(activityBackdropTarget({ type: "like_collection", collectionId: 10, mediaType: "movie", tmdbId: 10 }), null);
  assert.equal(activityBackdropTarget({ type: "watched", mediaType: "movie" }), null);
});

test("la URL usa el tamaño pedido de TMDb", () => {
  assert.equal(activityBackdropSrc("/a.jpg", "w780"), "https://image.tmdb.org/t/p/w780/a.jpg");
  assert.equal(activityBackdropSrc(null), null);
});

test("en la vista con backdrop también entran listas con títulos y colecciones", () => {
  assert.equal(hasActivityBackdropArtwork({ type: "list", id: "list:1", previewItems: [{ tmdbId: 1, mediaType: "movie" }] }), true);
  assert.equal(hasActivityBackdropArtwork({ type: "list", id: "list:1", previewItems: [] }), false);
  assert.equal(hasActivityBackdropArtwork({ type: "like_collection", collectionId: 9485 }), true);
  assert.equal(hasActivityBackdropArtwork({ type: "watched", mediaType: "movie", tmdbId: 550 }), true);
  assert.equal(hasActivityBackdropArtwork({ type: "favorite" }), false);
});
