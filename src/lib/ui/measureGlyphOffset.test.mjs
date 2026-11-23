import assert from "node:assert/strict";
import test from "node:test";

import { inkCenterShift } from "./measureGlyphOffset.js";

const ink = (left, right, ascent, descent) => ({ left, right, ascent, descent });

test("sin trozos de texto no desplaza", () => {
  assert.deepEqual(inkCenterShift({ center: { x: 10, y: 10 }, runs: [] }), { x: 0, y: 0 });
});

test("una cifra que apoya en la base y con margen lateral se lleva al centro", () => {
  // Origen en (20, 30); la tinta va de x=21 a x=31 y de y=14 a y=30.
  const runs = [{ originX: 20, baselineY: 30, ink: ink(-1, 11, 16, 0) }];
  // Centro de la tinta (26, 22) → centro del botón (25, 25).
  assert.deepEqual(inkCenterShift({ center: { x: 25, y: 25 }, runs }), { x: -1, y: 3 });
});

test("número + '%' se centra como un solo bloque", () => {
  const runs = [
    { originX: 10, baselineY: 40, ink: ink(0, 20, 18, 0) },
    { originX: 31, baselineY: 40, ink: ink(0, 8, 9, 0) },
  ];
  // Unión: x 10→39 (centro 24,5), y 22→40 (centro 31).
  assert.deepEqual(inkCenterShift({ center: { x: 24.5, y: 31 }, runs }), { x: 0, y: 0 });
});

test("suma el desplazamiento que ya lleva aplicado", () => {
  const runs = [{ originX: 0, baselineY: 10, ink: ink(0, 10, 10, 0) }];
  const shift = inkCenterShift({ center: { x: 6, y: 5 }, runs, current: { x: 2, y: -1 } });
  assert.deepEqual(shift, { x: 3, y: -1 });
});

test("con el botón escalado devuelve px sin escalar", () => {
  // Botón a escala 2: la tinta medida en el DOM mide el doble.
  const runs = [{ originX: 0, baselineY: 20, ink: ink(0, 10, 10, 0) }];
  // Tinta en pantalla: x 0→20 (centro 10), y 0→20 (centro 10). Centro 12,12 → 2 px en pantalla = 1 px CSS.
  assert.deepEqual(inkCenterShift({ center: { x: 12, y: 12 }, runs, scale: 2 }), { x: 1, y: 1 });
});

test("redondea a cuartos de píxel y nunca devuelve -0", () => {
  const runs = [{ originX: 0, baselineY: 10, ink: ink(0, 10, 10, 0) }];
  assert.deepEqual(inkCenterShift({ center: { x: 5.1, y: 5.4 }, runs }), { x: 0, y: 0.5 });
  const neg = inkCenterShift({ center: { x: 4.95, y: 5 }, runs });
  assert.ok(Object.is(neg.x, 0));
});
