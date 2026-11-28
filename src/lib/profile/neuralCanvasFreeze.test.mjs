import assert from "node:assert/strict";
import test from "node:test";

import { freezeNeuralCanvas, frozenCanvasStyle } from "./neuralCanvasFreeze.js";

const MASK = "linear-gradient(rgba(0, 0, 0, 0), rgb(0, 0, 0) 32px)";

function fakeElement(offsetHeight = 0, computedMask = "none") {
  return { offsetHeight, style: {}, computedMask };
}
const view = { getComputedStyle: (el) => ({ maskImage: el.computedMask }) };

test("el lienzo congelado no es más bajo que el marco ni que la pantalla", () => {
  assert.equal(frozenCanvasStyle(500, 800, false).height, "800px");
  assert.equal(frozenCanvasStyle(900.4, 800, false).height, "901px");
  assert.equal(frozenCanvasStyle(500, 800, false).top, "auto");
});

test("con fundido (móvil), la máscara pasa del lienzo al marco y vuelve al liberar", () => {
  const canvas = fakeElement(0, MASK);
  const stage = fakeElement(520);
  const release = freezeNeuralCanvas({ canvas, stage, viewportHeight: 844, view });
  assert.equal(canvas.style.height, "844px");
  assert.equal(canvas.style.maskImage, "none");
  assert.equal(stage.style.maskImage, MASK);

  release();
  for (const property of ["top", "height", "maskImage", "webkitMaskImage"]) {
    assert.equal(canvas.style[property], "", property);
  }
  assert.equal(stage.style.maskImage, "");
});

test("sin fundido (escritorio), el marco no recibe máscara", () => {
  const canvas = fakeElement();
  const stage = fakeElement(520);
  const release = freezeNeuralCanvas({ canvas, stage, viewportHeight: 844, view });
  assert.equal(stage.style.maskImage, undefined);
  assert.equal(canvas.style.maskImage, undefined);
  release();
  assert.equal(canvas.style.height, "");
});
