import assert from "node:assert/strict";
import test from "node:test";

import { canScrollInDirection } from "./touchScrollGuard.js";

const box = ({ scrollTop = 0, scrollHeight = 1000, clientHeight = 400, scrollLeft = 0, scrollWidth = 400, clientWidth = 400 } = {}) => ({
  scrollTop,
  scrollHeight,
  clientHeight,
  scrollLeft,
  scrollWidth,
  clientWidth,
});
const scrollY = { overflowY: "auto", overflowX: "hidden" };
const scrollX = { overflowY: "hidden", overflowX: "auto" };

test("una lista desplazada hacia abajo puede volver hacia arriba", () => {
  // Dedo hacia ABAJO (deltaY > 0) = contenido hacia arriba.
  assert.equal(canScrollInDirection(box({ scrollTop: 300 }), 0, 12, scrollY), true);
});

test("en el tope, tirar hacia abajo NO lo absorbe la lista (no debe llegar a la página)", () => {
  assert.equal(canScrollInDirection(box({ scrollTop: 0 }), 0, 12, scrollY), false);
});

test("al final, seguir bajando tampoco lo absorbe", () => {
  assert.equal(canScrollInDirection(box({ scrollTop: 600 }), 0, -12, scrollY), false);
  assert.equal(canScrollInDirection(box({ scrollTop: 100 }), 0, -12, scrollY), true);
});

test("un elemento que no desborda o con overflow visible/hidden no cuenta", () => {
  assert.equal(canScrollInDirection(box({ scrollHeight: 400 }), 0, -12, scrollY), false);
  assert.equal(
    canScrollInDirection(box({ scrollTop: 300 }), 0, 12, { overflowY: "hidden", overflowX: "hidden" }),
    false,
  );
});

test("los gestos horizontales miran el eje horizontal", () => {
  const row = box({ scrollWidth: 1200, clientWidth: 400, scrollLeft: 0 });
  assert.equal(canScrollInDirection(row, -20, 3, scrollX), true);
  assert.equal(canScrollInDirection(row, 20, 3, scrollX), false);
  // Un scroller solo horizontal no absorbe un gesto vertical.
  assert.equal(canScrollInDirection(row, 0, 12, scrollX), false);
});
