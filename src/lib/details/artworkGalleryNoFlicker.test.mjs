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
  // El relevo de la fila (ArtworkRowSwap) depende de la identidad.
  assert.match(source, /identity=\{artworkRowIdentity\}/);
  assert.match(source, /\}, \[imagesLoading, identity, rowRef\]\);/);
  assert.doesNotMatch(source, /\}, \[imagesLoading, artworkSelection, artworkPreloadCount\]\);/);
});

// Al cambiar de tipo de imagen o de filtro, la fila anterior se queda hasta
// tener descargadas las nuevas con el MISMO srcset que las tarjetas (con otra
// URL la tarjeta volvía a esperar y salía en negro), y el relevo es estado de
// la fila, no de la ficha entera (su render cortaba la animación).
test("cambiar de tipo releva la fila sin esqueleto ni tarjetas en negro", () => {
  assert.match(source, /function ArtworkRowSwap\(/);
  assert.match(source, /const \[shown, setShown\] = useState\(null\);/);
  assert.match(source, /artworkCardImage\(rowArtworkSelection, filePath\)/);
  assert.match(source, /\.map\(\(filePath\) => artworkCardImage\(selection, filePath\)\)/);
  assert.doesNotMatch(source, /setShownArtwork/);
});

test("al elegir una imagen se captura la posición para la animación FLIP", () => {
  assert.match(source, /if \(!isActive\) captureArtworkFlip\(\);/);
  assert.match(source, /swiper\.slideTo\?\.\(0, 0\)/);
});
