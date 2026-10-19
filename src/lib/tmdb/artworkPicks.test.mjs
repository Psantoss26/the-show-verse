import assert from "node:assert/strict";
import test from "node:test";

import {
  artworkItemKey,
  normalizeArtworkKey,
  pickBestBackdropByLangResVotes,
  pickListArtwork,
  pickSeasonArtwork,
  seasonArtworkKey,
} from "./artworkPicks.js";

test("claves de título normalizadas", () => {
  assert.equal(artworkItemKey("tv", "1399"), "tv:1399");
  assert.equal(artworkItemKey("movie", 603), "movie:603");
  assert.equal(artworkItemKey("show", 1), "movie:1");
  assert.equal(artworkItemKey("movie", "x"), null);
  assert.equal(artworkItemKey("movie", -1), null);
});

test("sin respuesta de TMDb no hay elección (null, no «sin póster»)", () => {
  assert.equal(pickListArtwork(null), null);
  assert.deepEqual(pickListArtwork({ posters: [], backdrops: [] }), { poster: null, previewPoster: null, previewBackdrop: null, textlessPoster: null, coverPoster: null, dashboardBackdrop: null, dashboardBackdropAlt: null });
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

test("sin inglés, el español; sin ninguno de los dos, el del idioma original", () => {
  const es = { file_path: "/es.jpg", iso_639_1: "es", width: 1000, height: 1500 };
  const ko = { file_path: "/ko.jpg", iso_639_1: "ko", width: 1000, height: 1500 };
  const none = { file_path: "/none.jpg", iso_639_1: null, width: 1000, height: 1500 };
  assert.equal(pickListArtwork({ posters: [none, es], backdrops: [] }).poster, "/es.jpg");
  assert.equal(pickListArtwork({ posters: [none, ko], backdrops: [] }, { originalLanguage: "ko" }).poster, "/ko.jpg");
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

test("textlessPoster: solo un póster sin idioma, nunca backdrop ni póster con texto", () => {
  const withText = { file_path: "/en.jpg", iso_639_1: "en", width: 2000, height: 3000, vote_average: 9, vote_count: 50 };
  const neutralBackdrop = { file_path: "/bd.jpg", iso_639_1: null, width: 3840, height: 2160 };
  assert.equal(pickListArtwork({ posters: [withText], backdrops: [neutralBackdrop] }).textlessPoster, null);
  const neutral = { file_path: "/xx.jpg", iso_639_1: "xx", width: 1000, height: 1500 };
  const picks = pickListArtwork({ posters: [withText, neutral], backdrops: [neutralBackdrop] });
  assert.equal(picks.textlessPoster, "/xx.jpg");
  assert.equal(picks.coverPoster, "/xx.jpg");
});

test("backdrop de los dashboards: ≥1200 px, escalera de idioma y resolución preferida", () => {
  const small = { file_path: "/en-780.jpg", iso_639_1: "en", width: 780, height: 439 };
  const en4k = { file_path: "/en-4k.jpg", iso_639_1: "en", width: 3840, height: 2160 };
  const enHd = { file_path: "/en-hd.jpg", iso_639_1: "en", width: 1920, height: 1080 };
  const es = { file_path: "/es.jpg", iso_639_1: "es", width: 1920, height: 1080 };
  const picks = pickListArtwork({ posters: [], backdrops: [es, small, en4k, enHd] });
  // 1920×1080 antes que 4K dentro del inglés; el pequeño no cuenta.
  assert.equal(picks.dashboardBackdrop, "/en-hd.jpg");
  // El SIGUIENTE (segunda imagen de «Mejor valoradas»).
  assert.equal(picks.dashboardBackdropAlt, "/en-4k.jpg");
  // Mismo resultado que el selector que usaba el navegador por tarjeta.
  assert.equal(picks.dashboardBackdrop, pickBestBackdropByLangResVotes([es, small, en4k, enHd])?.file_path);
  assert.equal(picks.dashboardBackdropAlt, pickBestBackdropByLangResVotes([es, small, en4k, enHd], { offset: 1 })?.file_path);
  // Sin inglés, el español.
  assert.equal(pickListArtwork({ posters: [], backdrops: [es] }).dashboardBackdrop, "/es.jpg");
});

test("claves de temporada y normalización de cualquier clave del lote", () => {
  assert.equal(seasonArtworkKey("1396", "2"), "season:1396:2");
  assert.equal(seasonArtworkKey(1396, 0), "season:1396:0");
  assert.equal(seasonArtworkKey(1396, -1), null);
  assert.equal(seasonArtworkKey("x", 1), null);
  assert.equal(normalizeArtworkKey("season:1396:3"), "season:1396:3");
  assert.equal(normalizeArtworkKey("tv:1396"), "tv:1396");
  assert.equal(normalizeArtworkKey("season:1396:x"), null);
});

test("póster de temporada con la escalera de idioma", () => {
  const es = { file_path: "/s-es.jpg", iso_639_1: "es" };
  const en = { file_path: "/s-en.jpg", iso_639_1: "en" };
  const none = { file_path: "/s-none.jpg", iso_639_1: null };
  assert.equal(pickSeasonArtwork(null), null);
  assert.deepEqual(pickSeasonArtwork({ posters: [es, none, en] }), { poster: "/s-en.jpg" });
  assert.deepEqual(pickSeasonArtwork({ posters: [none, es] }), { poster: "/s-es.jpg" });
  assert.deepEqual(pickSeasonArtwork({ posters: [none] }), { poster: "/s-none.jpg" });
  assert.deepEqual(pickSeasonArtwork({ posters: [] }), { poster: null });
});
