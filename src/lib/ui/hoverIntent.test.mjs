import assert from "node:assert/strict";
import test from "node:test";

import { createRestDetector, HOVER_REST_MS, HOVER_MAX_MS } from "./hoverIntent.js";

// Temporizadores falsos: `advance(ms)` dispara los que vencen.
function fakeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    now: () => now,
    setTimer(fn, ms) {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, t]) => t.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = end;
    },
  };
}

function setup() {
  const clock = fakeClock();
  let rested = 0;
  const detector = createRestDetector({
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    onRest: () => rested++,
  });
  return { clock, detector, rested: () => rested };
}

test("pasar de largo (entrar y salir antes del reposo) no activa nada", () => {
  const { clock, detector, rested } = setup();
  detector.enter(0, 0);
  clock.advance(HOVER_REST_MS - 10);
  detector.leave();
  clock.advance(HOVER_MAX_MS * 2);
  assert.equal(rested(), 0);
});

test("cursor que sigue moviéndose deprisa no activa el reposo", () => {
  const { clock, detector, rested } = setup();
  detector.enter(0, 0);
  // 1000 px/s: 16 px por fotograma.
  for (let t = 16; t < HOVER_MAX_MS - 20; t += 16) {
    clock.advance(16);
    detector.move(t, 0);
  }
  assert.equal(rested(), 0);
  detector.leave();
});

test("parar el cursor sobre la tarjeta lo activa tras el reposo, una sola vez", () => {
  const { clock, detector, rested } = setup();
  detector.enter(0, 0);
  clock.advance(48);
  detector.move(40, 0); // aún llegando
  clock.advance(HOVER_REST_MS - 1);
  assert.equal(rested(), 0);
  clock.advance(1);
  assert.equal(rested(), 1);
  detector.move(41, 1); // temblor mínimo ya activo: nada más
  clock.advance(HOVER_REST_MS * 3);
  assert.equal(rested(), 1);
});

test("temblores de pocos píxeles cuentan como parado", () => {
  const { clock, detector, rested } = setup();
  detector.enter(10, 10);
  for (let i = 0; i < 5; i++) {
    clock.advance(16);
    detector.move(10 + (i % 2) * 2, 10);
  }
  clock.advance(HOVER_REST_MS);
  assert.equal(rested(), 1);
});

test("muy despacio dentro de la tarjeta acaba activándose por tiempo", () => {
  const { clock, detector, rested } = setup();
  detector.enter(0, 0);
  // ~250 px/s: nunca reposa, pero lleva mucho rato encima.
  for (let t = 16; t <= HOVER_MAX_MS + 16; t += 16) {
    clock.advance(16);
    detector.move(t / 4, 0);
  }
  assert.equal(rested(), 1);
});

test("salir cancela los temporizadores pendientes", () => {
  const { clock, detector, rested } = setup();
  detector.enter(0, 0);
  detector.leave();
  clock.advance(HOVER_MAX_MS * 2);
  assert.equal(rested(), 0);
});

test("cruzar deprisa una tarjeta muy ancha (fila de lista) no la activa por tiempo", () => {
  const { clock, detector, rested } = setup();
  detector.enter(0, 0);
  // 1200 px/s durante 1 s dentro de la misma tarjeta.
  for (let t = 16; t <= 1000; t += 16) {
    clock.advance(16);
    detector.move(t * 1.2, 0);
  }
  assert.equal(rested(), 0);
  // Al frenar dentro, se activa.
  clock.advance(HOVER_REST_MS + 60);
  assert.equal(rested(), 1);
});
