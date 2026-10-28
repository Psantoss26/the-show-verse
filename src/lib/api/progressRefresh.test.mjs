import assert from "node:assert/strict";
import test from "node:test";
import { watchProgressRefresh } from "./progressRefresh.js";

function fakeBrowser() {
  const listeners = { doc: {}, win: {} };
  const intervals = [];
  globalThis.document = {
    visibilityState: "visible",
    addEventListener: (t, f) => { listeners.doc[t] = f; },
    removeEventListener: (t) => { delete listeners.doc[t]; },
  };
  globalThis.window = {
    setInterval: (f) => { intervals.push(f); return intervals.length; },
    clearInterval: (id) => { intervals[id - 1] = null; },
    addEventListener: (t, f) => { listeners.win[t] = f; },
    removeEventListener: (t) => { delete listeners.win[t]; },
  };
  return { listeners, intervals };
}

test("Continuar viendo se relee mientras está a la vista y al volver, con un mínimo entre lecturas", () => {
  const { listeners, intervals } = fakeBrowser();
  let clock = 0;
  let loads = 0;
  const stop = watchProgressRefresh(() => { loads += 1; }, { minMs: 30_000, now: () => clock });

  clock = 10_000;
  listeners.win.focus();
  assert.equal(loads, 0, "volver enseguida no repite la lectura");

  clock = 60_000;
  intervals[0]();
  assert.equal(loads, 1, "a la vista, se relee cada intervalo");

  globalThis.document.visibilityState = "hidden";
  clock = 200_000;
  intervals[0]();
  assert.equal(loads, 1, "en segundo plano no se pide nada");

  globalThis.document.visibilityState = "visible";
  listeners.doc.visibilitychange();
  assert.equal(loads, 2, "al volver a la pestaña se relee");

  stop();
  assert.equal(intervals[0], null);
  assert.deepEqual(Object.keys(listeners.doc), []);
  assert.deepEqual(Object.keys(listeners.win), []);
  delete globalThis.document;
  delete globalThis.window;
});
