import assert from "node:assert/strict";
import test from "node:test";

import { FROZEN_STAGE_HEIGHT_VAR, freezeNeuralCanvas, frozenCanvasStyle, syncFrozenStageHeight } from "./neuralCanvasFreeze.js";

function fakeElement(offsetHeight = 0) {
  const props = new Map();
  return {
    offsetHeight,
    style: {
      setProperty: (name, value) => props.set(name, value),
      removeProperty: (name) => props.delete(name),
      getPropertyValue: (name) => props.get(name) ?? "",
    },
  };
}

test("el lienzo congelado no es más bajo que el marco ni que la pantalla", () => {
  assert.equal(frozenCanvasStyle(500, 800).height, "800px");
  assert.equal(frozenCanvasStyle(900.4, 800).height, "901px");
});

test("el lienzo congelado se ancla abajo y la máscara sigue al marco", () => {
  const style = frozenCanvasStyle(500, 800);
  assert.equal(style.top, "auto");
  assert.equal(style.maskPosition, "bottom");
  assert.equal(style.maskRepeat, "no-repeat");
  assert.equal(style.maskSize, `100% var(${FROZEN_STAGE_HEIGHT_VAR}, 100%)`);
});

test("congelar fija el alto una vez; liberar devuelve los estilos del CSS", () => {
  const canvas = fakeElement();
  const stage = fakeElement(520);
  const release = freezeNeuralCanvas({ canvas, stage, viewportHeight: 844 });
  assert.equal(canvas.style.height, "844px");
  assert.equal(stage.style.getPropertyValue(FROZEN_STAGE_HEIGHT_VAR), "520px");

  // El marco crece durante el morph: el lienzo NO cambia (sin redibujar).
  syncFrozenStageHeight(stage, 600);
  assert.equal(canvas.style.height, "844px");
  assert.equal(stage.style.getPropertyValue(FROZEN_STAGE_HEIGHT_VAR), "600px");

  release();
  for (const property of ["top", "height", "maskSize", "maskPosition", "maskRepeat"]) {
    assert.equal(canvas.style[property], "", property);
  }
  assert.equal(stage.style.getPropertyValue(FROZEN_STAGE_HEIGHT_VAR), "");
});
