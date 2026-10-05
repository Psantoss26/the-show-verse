import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../../components/DetailsClient.jsx", import.meta.url), "utf8");

// Elegir una imagen en "Portadas y fondos" solo REORDENA la galería (la elegida
// pasa a la primera posición con la animación FLIP). Si la precarga que oculta
// el carrusel tras el esqueleto dependiera del orden, la primera elección lo
// desmontaba y volvía a montarlo: un parpadeo que además se comía la animación.
test("la precarga de la galería depende de qué imágenes hay, no de su orden", () => {
  assert.match(source, /const artworkRowIdentity = useMemo\(/);
  assert.match(source, /\.sort\(\),\s*\]\.join\("\|"\)/, "la identidad ordena las rutas: ignora el orden");
  assert.match(source, /\}, \[imagesLoading, artworkRowIdentity, artworkPreloadCount\]\);/);
  assert.doesNotMatch(source, /\}, \[imagesLoading, artworkSelection, artworkPreloadCount\]\);/);
});

test("al elegir una imagen se captura la posición para la animación FLIP", () => {
  assert.match(source, /if \(!isActive\) captureArtworkFlip\(\);/);
  assert.match(source, /swiper\.slideTo\?\.\(0, 0\)/);
});
