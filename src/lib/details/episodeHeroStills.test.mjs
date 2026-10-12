import assert from "node:assert/strict";
import test from "node:test";

import {
  EPISODE_HERO_MAX_BANDS,
  pickEpisodeBackdrop,
  pickEpisodeHeroStills,
} from "./episodeHeroStills.js";

const img = (file_path, iso_639_1 = null) => ({ file_path, iso_639_1 });

test("tres bandas como máximo: la imagen oficial del episodio primero y luego el orden de TMDb", () => {
  const paths = pickEpisodeHeroStills({
    stillPath: "/oficial.jpg",
    stills: [img("/a.jpg"), img("/oficial.jpg"), img("/b.jpg"), img("/c.jpg"), img("/d.jpg")],
  });
  assert.equal(EPISODE_HERO_MAX_BANDS, 3);
  assert.deepEqual(paths, ["/oficial.jpg", "/a.jpg", "/b.jpg"]);
});

test("solo imágenes sin texto si las hay; las rotuladas, únicamente si no queda otra", () => {
  assert.deepEqual(
    pickEpisodeHeroStills({ stills: [img("/en.jpg", "en"), img("/a.jpg"), img("/xx.jpg", "xx"), img("/b.jpg", "")] }),
    ["/a.jpg", "/xx.jpg", "/b.jpg"],
  );
  assert.deepEqual(
    pickEpisodeHeroStills({ stills: [img("/en.jpg", "en"), img("/es.jpg", "es")] }),
    ["/en.jpg", "/es.jpg"],
  );
});

test("con dos imágenes del episodio salen dos bandas, sin rellenar con la serie", () => {
  assert.deepEqual(
    pickEpisodeHeroStills({ stills: [img("/a.jpg"), img("/b.jpg")], showBackdrops: [img("/serie.jpg")] }),
    ["/a.jpg", "/b.jpg"],
  );
});

test("con una sola imagen se completa hasta dos con un fondo sin texto de la serie", () => {
  assert.deepEqual(
    pickEpisodeHeroStills({
      stillPath: "/a.jpg",
      stills: [img("/a.jpg")],
      showBackdrops: [img("/rotulado.jpg", "en"), img("/serie1.jpg"), img("/serie2.jpg")],
    }),
    ["/a.jpg", "/serie1.jpg"],
  );
});

test("sin imágenes del episodio, dos fondos de la serie; sin nada, la imagen oficial o vacío", () => {
  assert.deepEqual(
    pickEpisodeHeroStills({ stills: [], showBackdrops: [img("/s1.jpg"), img("/s2.jpg"), img("/s3.jpg")] }),
    ["/s1.jpg", "/s2.jpg"],
  );
  assert.deepEqual(pickEpisodeHeroStills({ stillPath: "/solo.jpg" }), ["/solo.jpg"]);
  assert.deepEqual(pickEpisodeHeroStills({}), []);
});

test("sin repetidos y tolerante a entradas inválidas", () => {
  assert.deepEqual(
    pickEpisodeHeroStills({
      stillPath: "/a.jpg",
      stills: [null, img(null), img("/a.jpg"), img("/a.jpg"), img("/b.jpg")],
      showBackdrops: [img("/b.jpg"), img("/s.jpg")],
    }),
    ["/a.jpg", "/b.jpg"],
  );
});

// Fondo de la ficha en ordenador: distinto de la imagen de portada si se puede.
test("el fondo usa otra imagen del episodio, distinta de la portada", () => {
  assert.equal(
    pickEpisodeBackdrop({
      stillPath: "/oficial.jpg",
      stills: [img("/oficial.jpg"), img("/rotulada.jpg", "en"), img("/otra.jpg")],
      showBackdrops: [img("/serie.jpg")],
    }),
    "/otra.jpg",
  );
});

test("sin otra imagen del episodio, un fondo sin texto de la serie", () => {
  assert.equal(
    pickEpisodeBackdrop({
      stillPath: "/oficial.jpg",
      stills: [img("/oficial.jpg")],
      showBackdrops: [img("/rotulado.jpg", "en"), img("/serie.jpg")],
      showBackdropPath: "/principal.jpg",
    }),
    "/serie.jpg",
  );
});

test("después, el fondo principal de la serie; y solo si no hay nada, la portada", () => {
  assert.equal(
    pickEpisodeBackdrop({ stillPath: "/oficial.jpg", showBackdropPath: "/principal.jpg" }),
    "/principal.jpg",
  );
  assert.equal(
    pickEpisodeBackdrop({ stillPath: "/oficial.jpg", showBackdropPath: "/oficial.jpg" }),
    "/oficial.jpg",
  );
  assert.equal(pickEpisodeBackdrop({ stillPath: "/oficial.jpg" }), "/oficial.jpg");
  assert.equal(pickEpisodeBackdrop({}), null);
});
