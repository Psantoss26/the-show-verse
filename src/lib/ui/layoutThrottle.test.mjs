import test from "node:test";
import assert from "node:assert/strict";
import { LAYOUT_SETTLE_MS, throttleDelay } from "./layoutThrottle.js";

test("el primer valor se aplica en el acto", () => {
  assert.equal(throttleDelay(null, 1000), 0);
});

test("un lote que llega en plena recolocación espera a que termine", () => {
  assert.equal(throttleDelay(1000, 1100), LAYOUT_SETTLE_MS - 100);
});

test("pasado el intervalo, el lote se aplica ya", () => {
  assert.equal(throttleDelay(1000, 1000 + LAYOUT_SETTLE_MS), 0);
  assert.equal(throttleDelay(1000, 5000), 0);
});

test("el intervalo cubre la recolocación animada completa", () => {
  // FlipReorder anima 320 ms: un intervalo menor volvería a cortarla.
  assert.ok(LAYOUT_SETTLE_MS > 320);
});

test("un reloj que retrocede no bloquea", () => {
  assert.equal(throttleDelay(2000, 1000), 0);
});
