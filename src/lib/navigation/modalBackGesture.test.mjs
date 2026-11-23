import { test } from "node:test";
import assert from "node:assert/strict";
import { backGestureStyle, backGestureTransform } from "./modalBackGesture.js";

test("en reposo el modal no se mueve", () => {
  assert.deepEqual(backGestureStyle(0, true, { rounded: true }), { scale: 1, translateX: 0, radius: null });
});

test("al final del gesto se encoge y se aparta del borde por el que entra", () => {
  const izq = backGestureStyle(1, true, { rounded: true });
  const der = backGestureStyle(1, false, { rounded: true });
  assert.ok(izq.scale < 1 && izq.scale >= 0.9);
  assert.ok(izq.translateX > 0);
  assert.equal(der.translateX, -izq.translateX);
});

test("avanza sin saltos y se limita a 0..1", () => {
  const a = backGestureStyle(0.25, true, { rounded: true });
  const b = backGestureStyle(0.5, true, { rounded: true });
  assert.ok(b.scale < a.scale && b.translateX > a.translateX);
  assert.deepEqual(backGestureStyle(3, true, { rounded: true }), backGestureStyle(1, true, { rounded: true }));
  assert.deepEqual(backGestureStyle(-1, true, { rounded: true }), backGestureStyle(0, true, { rounded: true }));
});

test("un panel de esquinas rectas (vista lateral a pantalla completa) las redondea", () => {
  assert.equal(backGestureStyle(0, true, { rounded: false }).radius, 0);
  assert.ok(backGestureStyle(1, true, { rounded: false }).radius > 0);
  assert.equal(backGestureStyle(1, true, { rounded: true }).radius, null);
});

test("el transform equivalente reproduce translate y scale", () => {
  assert.equal(backGestureTransform({ scale: 0.92, translateX: 24 }), "translateX(24px) scale(0.92)");
});
