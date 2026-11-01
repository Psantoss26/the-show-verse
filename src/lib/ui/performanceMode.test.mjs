import assert from "node:assert/strict";
import test from "node:test";

import {
  LITE_MIN_JANKY,
  MIN_WINDOWS,
  PERF_BOOT_SCRIPT,
  isJankyWindow,
  recordWindow,
  shouldUseLite,
} from "./performanceMode.js";

const frames = (count, ms) => Array.from({ length: count }, () => ms);

test("una racha fluida a 60 o 120 Hz no va a tirones", () => {
  assert.equal(isJankyWindow(frames(60, 16.7)), false);
  assert.equal(isJankyWindow(frames(120, 8.3)), false);
});

test("el límite de 30 Hz del ahorro de batería no cuenta como tirones", () => {
  assert.equal(isJankyWindow(frames(30, 33.4)), false);
});

test("una racha con muchos fotogramas perdidos va a tirones", () => {
  assert.equal(isJankyWindow([...frames(20, 16.7), ...frames(8, 66)]), true);
});

test("unos pocos picos sueltos no bastan", () => {
  assert.equal(isJankyWindow([...frames(55, 16.7), ...frames(3, 80)]), false);
});

test("rachas cortas o con la pestaña congelada no se evalúan", () => {
  assert.equal(isJankyWindow(frames(10, 66)), null);
  assert.equal(isJankyWindow([...frames(10, 16.7), 5000]), null);
  assert.equal(isJankyWindow(frames(15, 66)), true, "un gesto de 1 s a 15 fps sí cuenta");
});

test("el veredicto exige varias rachas a tirones, no una suelta", () => {
  let probe = null;
  for (let i = 0; i < MIN_WINDOWS - 1; i += 1) probe = recordWindow(probe, true);
  assert.equal(probe.verdict, null, "aún no hay rachas suficientes");
  probe = recordWindow(probe, true);
  assert.equal(probe.verdict, "lite");
});

test("un equipo fluido con algún tirón suelto nunca pasa a ligero", () => {
  let probe = null;
  for (let i = 0; i < 100; i += 1) probe = recordWindow(probe, i % 3 === 0);
  assert.equal(probe.verdict, null);
  assert.ok(probe.windows.reduce((a, b) => a + b, 0) < LITE_MIN_JANKY);
});

test("el modo elegido manda sobre lo medido", () => {
  assert.equal(shouldUseLite({ mode: "full", verdict: "lite", deviceMemory: 1 }), false);
  assert.equal(shouldUseLite({ mode: "lite" }), true);
  assert.equal(shouldUseLite({ mode: "auto", verdict: "lite" }), true);
  assert.equal(shouldUseLite({ mode: "auto", deviceMemory: 2 }), true);
  assert.equal(shouldUseLite({ mode: "auto", deviceMemory: 8 }), false);
  assert.equal(shouldUseLite({}), false, "sin datos: calidad completa");
});

test("el script del <head> marca <html> igual que shouldUseLite", () => {
  const run = (store, deviceMemory) => {
    const attrs = new Set();
    const fn = new Function("localStorage", "navigator", "document", PERF_BOOT_SCRIPT);
    fn(
      { getItem: (k) => store[k] ?? null },
      { deviceMemory },
      { documentElement: { setAttribute: (name) => attrs.add(name) } },
    );
    return attrs.has("data-sv-lite");
  };
  assert.equal(run({}, 8), false);
  assert.equal(run({}, undefined), false);
  assert.equal(run({}, 2), true);
  assert.equal(run({ "sv-perf-mode": "full" }, 1), false);
  assert.equal(run({ "sv-perf-mode": "lite" }, 8), true);
  assert.equal(run({ "sv-perf-probe-v1": JSON.stringify({ verdict: "lite" }) }, 8), true);
  assert.equal(run({ "sv-perf-probe-v1": "{roto" }, 8), false);
});
