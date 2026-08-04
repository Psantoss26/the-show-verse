import test from "node:test";
import assert from "node:assert/strict";

import {
  SWIPE_ACTIONS,
  SWIPE_DISTANCE_THRESHOLD,
  SWIPE_VELOCITY_THRESHOLD,
  exitTargetFor,
  resolveSwipeAction,
} from "./swipeDecision.js";

const gesture = (offset, velocity = { x: 0, y: 0 }) => ({ offset, velocity });

test("un gesto por debajo de los umbrales no dispara ninguna acción", () => {
  const result = resolveSwipeAction(
    gesture({ x: 40, y: -20 }, { x: 100, y: -80 }),
  );
  assert.equal(result, null);
});

test("acepta por DISTANCIA aunque el gesto sea lento", () => {
  assert.equal(
    resolveSwipeAction(gesture({ x: SWIPE_DISTANCE_THRESHOLD, y: 0 })),
    SWIPE_ACTIONS.WATCHLIST,
  );
  assert.equal(
    resolveSwipeAction(gesture({ x: -SWIPE_DISTANCE_THRESHOLD, y: 0 })),
    SWIPE_ACTIONS.DISMISS,
  );
});

test("acepta por VELOCIDAD aunque el recorrido sea corto (flick)", () => {
  assert.equal(
    resolveSwipeAction(gesture({ x: 20, y: 0 }, { x: SWIPE_VELOCITY_THRESHOLD, y: 0 })),
    SWIPE_ACTIONS.WATCHLIST,
  );
  assert.equal(
    resolveSwipeAction(gesture({ x: -20, y: 0 }, { x: -SWIPE_VELOCITY_THRESHOLD, y: 0 })),
    SWIPE_ACTIONS.DISMISS,
  );
});

test("deslizar hacia arriba marca favorito", () => {
  assert.equal(
    resolveSwipeAction(gesture({ x: 0, y: -SWIPE_DISTANCE_THRESHOLD })),
    SWIPE_ACTIONS.FAVORITE,
  );
});

test("deslizar hacia ABAJO no hace nada (compite con el scroll de la página)", () => {
  assert.equal(
    resolveSwipeAction(gesture({ x: 0, y: 400 }, { x: 0, y: 900 })),
    null,
  );
});

test("con ambos ejes superados gana el recorrido dominante", () => {
  // Lateral claro con algo de deriva vertical -> sigue siendo lateral.
  assert.equal(
    resolveSwipeAction(gesture({ x: 200, y: -130 })),
    SWIPE_ACTIONS.WATCHLIST,
  );
  // Vertical claro con algo de deriva lateral -> favorito.
  assert.equal(
    resolveSwipeAction(gesture({ x: 120, y: -260 })),
    SWIPE_ACTIONS.FAVORITE,
  );
});

test("un flick puro sin recorrido usa la dirección de la velocidad", () => {
  assert.equal(
    resolveSwipeAction(gesture({ x: 0, y: 0 }, { x: -800, y: 0 })),
    SWIPE_ACTIONS.DISMISS,
  );
});

test("el destino de salida saca la carta completa de la pantalla", () => {
  const width = 390;
  assert.ok(exitTargetFor(SWIPE_ACTIONS.WATCHLIST, width).x > width);
  assert.ok(exitTargetFor(SWIPE_ACTIONS.DISMISS, width).x < -width);
  assert.ok(exitTargetFor(SWIPE_ACTIONS.FAVORITE, width).y < 0);
});

test("en pantallas muy estrechas mantiene un mínimo de recorrido de salida", () => {
  // Sin suelo, un viewport diminuto dejaría la carta a medio salir.
  assert.ok(Math.abs(exitTargetFor(SWIPE_ACTIONS.DISMISS, 200).x) >= 480);
});
