import assert from "node:assert/strict";
import test from "node:test";
import { createImageRetainer } from "./retainPageImages.js";

function fakeImages() {
  const created = [];
  return {
    created,
    createImage: () => {
      const image = { src: "", crossOrigin: null };
      created.push(image);
      return image;
    },
  };
}

const poster = (name, extra = {}) => ({ src: `https://image.tmdb.org/t/p/w780/${name}.jpg`, width: 780, height: 1170, ...extra });

test("conserva una referencia viva por imagen visible de la página", () => {
  const { created, createImage } = fakeImages();
  const retainer = createImageRetainer({ createImage });
  retainer.replace("/favorites", [poster("a"), poster("a")]);
  assert.equal(created.length, 1, "la misma URL no se duplica");
  assert.equal(created[0].src, "https://image.tmdb.org/t/p/w780/a.jpg");
  assert.equal(retainer.has("https://image.tmdb.org/t/p/w780/a.jpg"), true);
});

test("cada instantánea sustituye a la anterior de esa página y reutiliza las que siguen", () => {
  const { created, createImage } = fakeImages();
  const retainer = createImageRetainer({ createImage });
  retainer.replace("/favorites", [poster("a"), poster("b")]);
  retainer.replace("/favorites", [poster("b"), poster("c")]);
  assert.equal(retainer.has(poster("a").src), false, "la que salió de pantalla se suelta");
  assert.equal(retainer.has(poster("b").src), true);
  assert.equal(retainer.has(poster("c").src), true);
  assert.equal(created.length, 3, "b no se vuelve a crear");
});

test("copia crossOrigin: sin él la caché de memoria no reutiliza la imagen", () => {
  const { created, createImage } = fakeImages();
  const retainer = createImageRetainer({ createImage });
  retainer.replace("/watchlist", [poster("b", { crossOrigin: "anonymous" })]);
  assert.equal(created[0].crossOrigin, "anonymous");
});

test("ignora URLs no remotas e imágenes enormes", () => {
  const { created, createImage } = fakeImages();
  const retainer = createImageRetainer({ createImage, maxPixels: 1000 });
  retainer.replace("/favorites", [
    { src: "data:image/png;base64,AAAA", width: 1, height: 1 },
    { src: "blob:https://x/1", width: 1, height: 1 },
    { src: "https://image.tmdb.org/t/p/original/c.jpg", width: 3840, height: 2160 },
  ]);
  assert.equal(created.length, 0);
});

test("limita las imágenes por página", () => {
  const { createImage } = fakeImages();
  const retainer = createImageRetainer({ createImage, maxPerPage: 2 });
  retainer.replace("/favorites", [poster("1"), poster("2"), poster("3")]);
  assert.equal(retainer.has(poster("3").src), false);
  assert.equal(retainer.has(poster("2").src), true);
});

test("solo guarda las últimas páginas; volver a una la renueva", () => {
  const { createImage } = fakeImages();
  const retainer = createImageRetainer({ createImage, maxPages: 2 });
  retainer.replace("/favorites", [poster("fav")]);
  retainer.replace("/details/movie/1", [poster("details")]);
  retainer.replace("/favorites", [poster("fav")]);
  retainer.replace("/details/movie/2", [poster("details-2")]);
  assert.equal(retainer.has(poster("fav").src), true, "Favoritos se usó después de la primera ficha");
  assert.equal(retainer.has(poster("details").src), false);
  assert.equal(retainer.has(poster("details-2").src), true);
});
