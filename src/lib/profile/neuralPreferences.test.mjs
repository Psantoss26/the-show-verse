import assert from "node:assert/strict";
import test from "node:test";

import { NEURAL_DEFAULTS, sanitizeNeuralPreferences } from "./neuralPreferences.js";

test("preferencias neurales: por defecto cabecera compacta y menú oculto", () => {
  assert.deepEqual(sanitizeNeuralPreferences(null), NEURAL_DEFAULTS);
  assert.equal(NEURAL_DEFAULTS.headerCollapsed, true);
  assert.equal(NEURAL_DEFAULTS.menuVisible, false);
});

test("preferencias neurales: solo valores conocidos", () => {
  const prefs = sanitizeNeuralPreferences({
    headerCollapsed: false,
    menuVisible: "sí",
    type: "tv",
    record: "otro",
    groupBy: "decade",
  });
  assert.deepEqual(prefs, { headerCollapsed: false, menuVisible: false, type: "tv", record: "all", groupBy: "decade" });
});
