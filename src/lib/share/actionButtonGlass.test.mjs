import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { actionButtonSurface } from "./actionButtonGlass.js";

const px = (v) => v * 2;
const green = { rgb: [34, 197, 94], secondary: [134, 239, 172] };

test("los botones de la imagen no dibujan borde: ni aro inset ni canto de refracción", () => {
  for (const variant of ["active", "solid", "idle"]) {
    const s = actionButtonSurface({ variant }, green, px);
    assert.doesNotMatch(s.boxShadow ?? "", /inset/, variant);
    // El canto de refracción (franja clara pegada al borde) va oculto en la ficha.
    assert.doesNotMatch(s.backgroundImage, /at 50% 50%, rgba\(255,255,255,0\) 66%/, variant);
  }
});

test("activo = cristal teñido del color de la acción y halo de ese color, como `.sv-lg-btn[data-active]`", () => {
  const s = actionButtonSurface({ variant: "active" }, green, px);
  assert.equal(s.backgroundColor, "rgba(0, 0, 0, 0.15)");
  assert.match(s.backgroundImage, /rgba\(134, 239, 172, 0\.34\) 0%, rgba\(34, 197, 94, 0\.26\) 35%/);
  assert.match(s.boxShadow, /0 0 48px -4px rgba\(34, 197, 94, 0\.42\)/);
});

test("reposo lleva la luz interior (`.sv-lg-sheen`) y la elevación con halo blanco", () => {
  const s = actionButtonSurface({ variant: "idle" }, undefined, px);
  assert.match(s.backgroundImage, /^radial-gradient\(90% 60% at 50% 12%/);
  assert.match(s.boxShadow, /0 0 64px rgba\(255,255,255,0\.06\)/);
});

test("ActionButton usa esta receta y no la antigua del aro de color", () => {
  const src = readFileSync(new URL("./ogKit.jsx", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("export function ActionButton"), src.indexOf("export const scoreSize"));
  assert.match(body, /actionButtonSurface\(/);
  assert.doesNotMatch(body, /inset 0 0 0/);
});

test("el tinte del activo cubre el botón entero: su elipse llega más allá del borde inferior", () => {
  // Satori no pinta fuera de la elipse de un radial-gradient: con un alto
  // menor que el 100 % el pie del botón quedaba sin tinte, cortado en recto.
  const s = actionButtonSurface({ variant: "active" }, green, px);
  const [, , ry] = s.backgroundImage.match(/radial-gradient\((\d+)% (\d+)% at 50% 0%, rgba\(134/);
  assert.ok(Number(ry) > 100, ry);
});
