import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const roulettePath = new URL("../../components/assistant/AssistantRoulette.jsx", import.meta.url);

test("la ruleta es un carrete de pósters, no la rueda de colores", async () => {
  const src = await readFile(roulettePath, "utf8");
  assert.doesNotMatch(src, /ROULETTE_COLORS|makeSvgSlice|slicePath|<svg/);
  // Pósters con la escalera de idioma de las tarjetas.
  assert.match(src, /useLadderPosters\(unique\)/);
  // Giro WAAPI de la PISTA (no del panel de cristal) con frenada larga.
  assert.match(src, /trackEl\.animate\(/);
  assert.match(src, /const SPIN_EASING = "cubic-bezier/);
  // Con «Reducir movimiento», sin giro.
  assert.match(src, /if \(reduceMotion \|\| !metrics\.step\)/);
});

test("resultado con ficha, otra vez y descartar; participantes con mínimo de 2", async () => {
  const src = await readFile(roulettePath, "utf8");
  assert.match(src, /Te toca ver/);
  assert.match(src, /onClick=\{previewClick\(\{ \.\.\.winner, media_type: winnerType \}, \{ mediaType: winnerType \}\)\}/);
  assert.match(src, /Girar otra vez/);
  assert.match(src, /Descartar y girar/);
  assert.match(src, /En la ruleta/);
  assert.match(src, /const locked = !out && count <= 2;/);
  // Tras pararse, el resultado se trae a la vista.
  assert.match(src, /resultRef\.current\?\.scrollIntoView/);
});
