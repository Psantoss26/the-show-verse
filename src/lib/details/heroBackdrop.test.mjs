import assert from "node:assert/strict";
import test from "node:test";

import {
  pickHeroBackdropPath,
  resolveNeutralBackdropPath,
} from "./tmdbImages.js";

// Datos reales de Breaking Bad (tv:1396), recortados. Lo importante es la
// forma: la portada principal `backdrop_path` TAMBIÉN está en la galería, pero
// no es la mejor neutra — que es justo lo que provocaba el salto.
const BACKDROP_PATH = "/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg";
const BACKDROPS = [
  { file_path: "/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg", iso_639_1: null, width: 3000, height: 1688, vote_count: 36, vote_average: 6.306 },
  { file_path: "/sp1RSDvoVsbvDouQx1A75ebU35e.jpg", iso_639_1: null, width: 1920, height: 1080, vote_count: 9, vote_average: 5.778 },
  { file_path: "/84XPpjGvxNyExjSuLQe0SzioErt.jpg", iso_639_1: null, width: 1920, height: 1080, vote_count: 26, vote_average: 5.616 },
  { file_path: "/63FA8vwSZnXkGxedrDQwni4JuZN.jpg", iso_639_1: null, width: 3840, height: 2160, vote_count: 12, vote_average: 5.5 },
  { file_path: "/localizado.jpg", iso_639_1: "es", width: 3840, height: 2160, vote_count: 99, vote_average: 9 },
];

// A lo que llega DetailsClient una vez inicializado el artwork.
const definitiva = (preferidas = [null, null]) =>
  resolveNeutralBackdropPath(BACKDROPS, preferidas);

test("el fondo provisional YA es el definitivo", async () => {
  const provisional = pickHeroBackdropPath({
    backdropPath: BACKDROP_PATH,
    backdrops: BACKDROPS,
    preferredPaths: [null, null],
  });

  // ESTE es el bug: antes el provisional era `backdrop_path` y la definitiva
  // otra distinta, así que toda carga cambiaba de imagen a mitad.
  assert.equal(provisional, definitiva());
  assert.notEqual(provisional, BACKDROP_PATH);
  assert.equal(provisional, "/63FA8vwSZnXkGxedrDQwni4JuZN.jpg");
});

test("una selección del usuario manda sobre el cálculo", async () => {
  const elegida = "/sp1RSDvoVsbvDouQx1A75ebU35e.jpg";
  const provisional = pickHeroBackdropPath({
    backdropPath: BACKDROP_PATH,
    backdrops: BACKDROPS,
    preferredPaths: [elegida, null],
  });

  assert.equal(provisional, elegida);
  assert.equal(provisional, definitiva([elegida, null]));
});

test("nunca elige arte localizado", async () => {
  // El de 3840x2160 con 99 votos es el mejor por tamaño y votos, pero lleva
  // idioma: el fondo del héroe solo admite arte sin texto.
  const provisional = pickHeroBackdropPath({
    backdropPath: BACKDROP_PATH,
    backdrops: BACKDROPS,
  });
  assert.notEqual(provisional, "/localizado.jpg");
});

test("sin galería cae en la portada principal, no en nada", async () => {
  assert.equal(
    pickHeroBackdropPath({ backdropPath: BACKDROP_PATH, backdrops: [] }),
    BACKDROP_PATH,
  );
  // Y sin nada de nada, `null` (el consumidor no pinta fondo).
  assert.equal(pickHeroBackdropPath({}), null);
  assert.equal(pickHeroBackdropPath(), null);
});
