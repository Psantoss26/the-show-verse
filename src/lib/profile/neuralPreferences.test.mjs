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
    groups: ["ratings", "decade", "otra"],
  });
  assert.deepEqual(prefs, { headerCollapsed: false, menuVisible: false, type: "tv", record: "all", groups: ["decade", "ratings"] });
});

test("preferencias neurales: varias agrupaciones, y el antiguo groupBy se migra", () => {
  assert.deepEqual(NEURAL_DEFAULTS.groups, ["genre", "saga"]);
  assert.deepEqual(sanitizeNeuralPreferences({ groupBy: "genre-saga" }).groups, ["genre", "saga"]);
  assert.deepEqual(sanitizeNeuralPreferences({ groupBy: "money" }).groups, ["money"]);
  assert.equal("groupBy" in sanitizeNeuralPreferences({ groupBy: "money" }), false);
  assert.deepEqual(sanitizeNeuralPreferences({ groups: [] }).groups, ["genre", "saga"]);
});
