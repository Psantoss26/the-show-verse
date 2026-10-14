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

test("conserva una referencia viva por imagen cargada de la página", () => {
  const { created, createImage } = fakeImages();
  const retainer = createImageRetainer({ createImage });
  retainer.retain("/favorites", { src: "https://image.tmdb.org/t/p/w342/a.jpg", width: 342, height: 513 });
  retainer.retain("/favorites", { src: "https://image.tmdb.org/t/p/w342/a.jpg", width: 342, height: 513 });
  assert.equal(created.length, 1, "la misma URL no se duplica");
  assert.equal(created[0].src, "https://image.tmdb.org/t/p/w342/a.jpg");
  assert.equal(retainer.has("https://image.tmdb.org/t/p/w342/a.jpg"), true);
});

test("copia crossOrigin: sin él la caché de memoria no reutiliza la imagen", () => {
  const { created, createImage } = fakeImages();
  const retainer = createImageRetainer({ createImage });
  retainer.retain("/watchlist", { src: "https://image.tmdb.org/t/p/w342/b.jpg", crossOrigin: "anonymous", width: 342, height: 513 });
  assert.equal(created[0].crossOrigin, "anonymous");
});

test("ignora URLs no remotas e imágenes enormes", () => {
  const { created, createImage } = fakeImages();
  const retainer = createImageRetainer({ createImage, maxPixels: 1000 });
  retainer.retain("/favorites", { src: "data:image/png;base64,AAAA", width: 1, height: 1 });
  retainer.retain("/favorites", { src: "blob:https://x/1", width: 1, height: 1 });
  retainer.retain("/favorites", { src: "https://image.tmdb.org/t/p/original/c.jpg", width: 3840, height: 2160 });
  assert.equal(created.length, 0);
});

test("limita las imágenes por página quitando las más antiguas", () => {
  const { createImage } = fakeImages();
  const retainer = createImageRetainer({ createImage, maxPerPage: 2 });
  for (const name of ["1", "2", "3"]) retainer.retain("/favorites", { src: `https://i/${name}.jpg`, width: 10, height: 10 });
  assert.equal(retainer.has("https://i/1.jpg"), false);
  assert.equal(retainer.has("https://i/2.jpg"), true);
  assert.equal(retainer.has("https://i/3.jpg"), true);
});

test("solo guarda las últimas páginas visitadas; volver a una la renueva", () => {
  const { createImage } = fakeImages();
  const retainer = createImageRetainer({ createImage, maxPages: 2 });
  retainer.retain("/favorites", { src: "https://i/fav.jpg", width: 10, height: 10 });
  retainer.retain("/details/movie/1", { src: "https://i/details.jpg", width: 10, height: 10 });
  retainer.retain("/favorites", { src: "https://i/fav-2.jpg", width: 10, height: 10 });
  retainer.retain("/details/movie/2", { src: "https://i/details-2.jpg", width: 10, height: 10 });
  assert.equal(retainer.has("https://i/fav.jpg"), true, "Favoritos se usó después de la primera ficha");
  assert.equal(retainer.has("https://i/details.jpg"), false);
  assert.equal(retainer.has("https://i/details-2.jpg"), true);
});
