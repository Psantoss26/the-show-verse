import test from "node:test";
import assert from "node:assert/strict";
import {
  TRAILER_DEFAULT_ASPECT,
  aspectFromMeasurements,
  measureContentRows,
} from "./trailerAspect.js";

// Fotograma sintético: bandas negras de `band` filas arriba y abajo.
function frame(width, height, band, value = 120) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = band; y < height - band; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  return data;
}

test("mide la franja con imagen descontando una fila por borde", () => {
  // 480×360 con un 16:9 dentro (270 filas): bandas de 45.
  assert.equal(measureContentRows(frame(480, 360, 45), 480, 360), 268);
  assert.equal(measureContentRows(frame(480, 360, 0, 0), 480, 360), 0);
});

test("16:9 sin bandas propias se queda en 16:9", () => {
  const h = measureContentRows(frame(480, 360, 45), 480, 360);
  assert.equal(aspectFromMeasurements([h], 480, 360), TRAILER_DEFAULT_ASPECT);
});

test("un 2,39:1 dentro del 16:9 se detecta", () => {
  // 480 / 2.39 ≈ 201 filas de imagen.
  const h = measureContentRows(frame(480, 360, 80), 480, 360);
  const aspect = aspectFromMeasurements([h], 480, 360);
  assert.ok(aspect > 2.35 && aspect < 2.45, String(aspect));
});

test("manda el fotograma con más imagen y se ignoran los negros", () => {
  const aspect = aspectFromMeasurements([0, 150, 240], 480, 360);
  assert.equal(aspect, 2);
  assert.equal(aspectFromMeasurements([0, 10], 480, 360), TRAILER_DEFAULT_ASPECT);
});
