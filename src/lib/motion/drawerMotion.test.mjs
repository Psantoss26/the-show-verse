import { test } from "node:test";
import assert from "node:assert/strict";

import { mobileDrawerPanel, mobileDrawerVeil } from "./drawerMotion.js";

// framer-motion solo pasa a WAAPI (compositor) la opacidad y `transform` como
// cadena; `x`, `y` y `scale` los escribe en JS fotograma a fotograma y se
// congelan con cada pausa del hilo principal (medido en la app de Android:
// 60-70 escrituras de estilo por apertura y pausas de 33-75 ms al navegar).
const COMPOSITOR_KEYS = new Set(["transform", "opacity"]);
const STATES = ["initial", "animate", "exit"];

function animatedKeys(state) {
  return Object.keys(state).filter((k) => k !== "transition" && k !== "transitionEnd");
}

for (const [name, motion] of Object.entries({ mobileDrawerPanel, mobileDrawerVeil })) {
  test(`${name}: solo anima propiedades del compositor`, () => {
    for (const s of STATES) {
      for (const key of animatedKeys(motion[s])) {
        assert.ok(COMPOSITOR_KEYS.has(key), `${name}.${s}.${key} se animaría en JS`);
      }
    }
  });
}

test("mobileDrawerPanel: transform en cadena, sin animar hacia none", () => {
  for (const s of STATES) {
    assert.equal(typeof mobileDrawerPanel[s].transform, "string");
    assert.notEqual(mobileDrawerPanel[s].transform, "none");
  }
});

test("mobileDrawerPanel: sale por donde entra", () => {
  assert.equal(mobileDrawerPanel.exit.transform, mobileDrawerPanel.initial.transform);
});

test("velo y panel entran y salen con la misma duración", () => {
  for (const s of ["animate", "exit"]) {
    assert.equal(
      mobileDrawerVeil[s].transition.duration,
      mobileDrawerPanel[s].transition.duration,
    );
  }
});

test("los springs no van al compositor: transiciones con duración y curva", () => {
  for (const motion of [mobileDrawerPanel, mobileDrawerVeil]) {
    for (const s of ["animate", "exit"]) {
      assert.notEqual(motion[s].transition.type, "spring");
      assert.ok(motion[s].transition.duration > 0);
      assert.ok(Array.isArray(motion[s].transition.ease));
    }
  }
});
