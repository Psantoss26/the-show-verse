import assert from "node:assert/strict";
import test from "node:test";

import {
  pickBestBackdropNoLang,
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

// ---------------------------------------------------------------------------
// PARIDAD CON DetailModal
//
// El modal resuelve su héroe con `backdropOverride || pickBestBackdropNoLang(...)
// || item.backdrop_path` (useDetailModalData). La ficha tiene que llegar a la
// MISMA imagen: si no, abrir la vista previa y entrar en la ficha del mismo
// título enseña dos fondos distintos, que es el fallo que originó este cambio.
const comoDetailModal = (backdrops, backdropPath) =>
  pickBestBackdropNoLang(
    backdrops.filter((b) => b.from !== "main"),
  )?.file_path || backdropPath || null;

// Caso que ANTES divergía: el más ANCHO y el de más ÁREA no son el mismo.
// El modal ordenaba por ancho (4096) y la ficha por área (3840x2160 = 8.29 Mpx
// frente a 7.03), así que cada uno elegía uno.
const ANCHO_VS_AREA = [
  { file_path: "/panoramica-4096.jpg", iso_639_1: null, width: 4096, height: 1716, vote_count: 4, vote_average: 5 },
  { file_path: "/uhd-3840.jpg", iso_639_1: null, width: 3840, height: 2160, vote_count: 40, vote_average: 8 },
];

test("la ficha elige EXACTAMENTE el mismo fondo que DetailModal", async () => {
  const ficha = pickHeroBackdropPath({
    backdropPath: BACKDROP_PATH,
    backdrops: ANCHO_VS_AREA,
  });

  assert.equal(ficha, comoDetailModal(ANCHO_VS_AREA, BACKDROP_PATH));
  assert.equal(ficha, "/panoramica-4096.jpg");

  // Y se deja constancia de que el criterio ANTERIOR de la ficha elegía otra:
  // por eso el mismo título se veía distinto según por dónde se entrara.
  assert.equal(
    resolveNeutralBackdropPath(ANCHO_VS_AREA, []),
    "/uhd-3840.jpg",
  );
});

test("mismo criterio también con la galería real", async () => {
  assert.equal(
    pickHeroBackdropPath({ backdropPath: BACKDROP_PATH, backdrops: BACKDROPS }),
    comoDetailModal(BACKDROPS, BACKDROP_PATH),
  );
});

// ---------------------------------------------------------------------------
// EL PARPADEO AL RECARGAR

test("sin galería, el fondo PROVISIONAL no pinta la portada principal", async () => {
  // Con `allowMainFallback: false` no hay imagen provisional: se espera. Pintar
  // `backdrop_path` (localizada casi siempre) y sustituirla al llegar la galería
  // es justo el "se ve un instante la otra imagen" del que venimos.
  assert.equal(
    pickHeroBackdropPath({
      backdropPath: BACKDROP_PATH,
      backdrops: [],
      allowMainFallback: false,
    }),
    null,
  );

  // Pero con galería el provisional YA es el definitivo, sin esperar a nada.
  assert.equal(
    pickHeroBackdropPath({
      backdropPath: BACKDROP_PATH,
      backdrops: BACKDROPS,
      allowMainFallback: false,
    }),
    pickHeroBackdropPath({ backdropPath: BACKDROP_PATH, backdrops: BACKDROPS }),
  );
});

test("la entrada PELADA de la portada principal no puede ganar", async () => {
  // DetailsClient mete `{ file_path, from: "main" }` en `imagesState.backdrops`.
  // No trae `iso_639_1`, así que sin filtro se colaría como textless.
  const conMain = [
    { file_path: BACKDROP_PATH, from: "main" },
    ...ANCHO_VS_AREA,
  ];
  assert.equal(
    pickHeroBackdropPath({ backdropPath: BACKDROP_PATH, backdrops: conMain }),
    "/panoramica-4096.jpg",
  );
});

test("pero la portada principal FUNDIDA con su entrada real sí compite", async () => {
  // Caso real (Barbie): la portada principal también está en la galería, así
  // que `mergeUniqueImages` funde las dos y la entrada buena arrastra la marca
  // `from: "main"`. Es arte legítimo —trae idioma y medidas— y de hecho era la
  // elección correcta: descartarla por la marca hacía que el servidor pintara
  // una imagen y el cliente la cambiara por otra.
  const fundida = [
    { file_path: "/principal.jpg", from: "main", iso_639_1: null, width: 3840, height: 2160, vote_count: 27, vote_average: 6.13 },
    { file_path: "/otra.jpg", iso_639_1: null, width: 3840, height: 2160, vote_count: 61, vote_average: 6.106 },
  ];
  assert.equal(
    pickHeroBackdropPath({ backdropPath: "/principal.jpg", backdrops: fundida }),
    "/principal.jpg",
  );
});
