import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

// Bloque de la app de Android del fondo animado de las páginas de usuario
// (UserPageBackdrop). Medido 2026-11-28: con las manchas desenfocadas con
// `filter: blur()` moviéndose, la carga de Favoritos daba ~34-40 fps y ~100
// fotogramas tarde en 6 s (CPU ×4, perfil de la app); sin `filter` y con el
// desenfoque pintado como degradado, ~57 fps y ~5, igual que sin fondo.
const appBlock = (selector) => {
  const re = new RegExp(`html\\[data-android-app\\] ${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "g");
  return [...css.matchAll(re)].map((m) => m[1]).join("\n");
};

test("en la app de Android las manchas del fondo no usan filter: blur", () => {
  assert.match(appBlock(".sv-upage-blob"), /filter:\s*none/);
});

test("el desenfoque de las manchas se pinta con un degradado radial en un ::before", () => {
  const before = appBlock(".sv-upage-blob::before");
  assert.match(before, /radial-gradient\(closest-side/);
  assert.match(before, /inset:\s*var\(--blob-spread\)/);
});

test("cada mancha conserva su color y su opacidad originales", () => {
  for (const [variant, color, alpha] of [["a", "--c1", "0.2"], ["b", "--a2", "0.18"], ["c", "--c3", "0.25"]]) {
    const block = appBlock(`.sv-upage-blob--${variant}`);
    assert.match(block, new RegExp(`--blob:\\s*var\\(${color}\\)`), variant);
    assert.match(block, new RegExp(`--blob-a:\\s*${alpha}`), variant);
  }
});

test("la aurora tampoco usa filter en la app de Android", () => {
  assert.match(appBlock(".sv-upage-aurora"), /filter:\s*none/);
});

test("el movimiento del fondo se mantiene (no se quitan las animaciones en la app)", () => {
  assert.doesNotMatch(appBlock(".sv-upage-blob"), /animation/);
  assert.doesNotMatch(appBlock(".sv-upage-aurora"), /animation/);
});
