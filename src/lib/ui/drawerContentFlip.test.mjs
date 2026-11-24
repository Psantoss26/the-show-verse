import assert from "node:assert/strict";
import test from "node:test";

import { growthClipInsets } from "./drawerContentFlip.js";

const rect = (width, height) => ({ width, height });

test("la raíz de la página nunca se recorta: lleva el fondo fijo detrás de las barras", () => {
  // Colección corta (o aún cargando): la raíz mide justo una pantalla
  // (min-h-screen). Recortarla al cerrar el drawer recortaba también su fondo
  // `fixed inset-0` y las barras superior y lateral se veían sobre el negro.
  assert.equal(growthClipInsets(rect(1000, 1000), rect(2000, 1000), 1000, true), null);
  assert.equal(growthClipInsets(rect(1000, 600), rect(2000, 600), 1000, true), null);
});

test("una caja de una pantalla de alto o más no se recorta", () => {
  assert.equal(growthClipInsets(rect(1000, 1000), rect(2000, 1000), 1000, false), null);
});

test("una caja pequeña con fondo que crece se recorta a su medida anterior", () => {
  assert.deepEqual(growthClipInsets(rect(300, 40), rect(500, 40), 1000, false), { right: 200, bottom: 0 });
});

test("al encoger no hay nada que recortar", () => {
  assert.equal(growthClipInsets(rect(500, 40), rect(300, 40), 1000, false), null);
});
