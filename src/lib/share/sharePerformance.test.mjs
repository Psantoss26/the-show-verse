import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Lo que hace rápida la imagen y el vídeo compartibles (medido en 2026-10).
// Se vigila en el código: cada punto, deshecho, devuelve segundos de espera.
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("el vídeo compone los fotogramas con suavizado bilineal, no «high»", async () => {
  // «high» costaba ~22 ms por fotograma frente a ~7 ms: 3-6 s por vídeo.
  const video = await read("./storyVideo.js");
  assert.match(video, /imageSmoothingQuality = "low"/);
  assert.doesNotMatch(video, /imageSmoothingQuality = "high"/);
});

test("las imágenes opacas salen en JPEG y guardadas; las capas transparentes, en PNG", async () => {
  const [card, list, story, listStory] = await Promise.all([
    read("../../app/api/share/details-card/route.jsx"),
    read("../../app/api/share/list-card/route.jsx"),
    read("../../app/api/share/details-story/route.jsx"),
    read("../../app/api/share/list-story/route.jsx"),
  ]);
  for (const source of [card, list]) {
    assert.match(source, /shareImageResponse\([\s\S]*?\{ jpeg: true \}/);
  }
  for (const source of [story, listStory]) {
    assert.match(source, /\{ jpeg: scene === "backdrop" \}/);
  }
});

test("el fondo ambiental llega ya filtrado y el componente no repite el filtro", async () => {
  // `brightness()`/`saturate()` sobre capas a lienzo completo eran ~270 ms de
  // render en resvg.
  const [kit, card, list] = await Promise.all([
    read("./ogKit.jsx"),
    read("../../app/api/share/details-card/route.jsx"),
    read("../../app/api/share/list-card/route.jsx"),
  ]);
  assert.match(kit, /\.\.\.\(ambientBase\.toned \? \{\} : \{ filter: AMBIENT_FILTER \}\)/);
  assert.match(kit, /\.\.\.\(ambient\.toned \? \{\} :/);
  assert.match(card, /loadAmbientLayers\(card\.posterPath\)/);
  assert.match(list, /loadAmbientLayers\(fallbackAmbientPath\)/);
  // El desenfoque en 16 bits necesita `rgb16` de punta a punta (sin él, negro).
  assert.match(kit, /pipelineColourspace\("rgb16"\)[\s\S]*?\.blur\(sigma\)[\s\S]*?toColourspace\("rgb16"\)/);
});

test("la portada a sangre se reduce al ancho del lienzo antes del render", async () => {
  const kit = await read("./ogKit.jsx");
  assert.match(kit, /fetchImage\(`\$\{TMDB\}\/original\$\{posterPath\}`, 6000, FULL_WIDTH\)/);
});

test("el botón de compartir adelanta la imagen y la hoja reutiliza esa petición", async () => {
  const [bits, sheet] = await Promise.all([
    read("../../components/details/DetailHeaderBits.jsx"),
    read("../../components/details/DetailsShareSheet.jsx"),
  ]);
  assert.match(bits, /onPointerEnter: warm, onFocus: warm, onTouchStart: warm/);
  assert.match(sheet, /export function prefetchShare/);
  assert.match(sheet, /requestShareImage\(config, cardKey\)/);
});
