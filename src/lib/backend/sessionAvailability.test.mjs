import test from "node:test";
import assert from "node:assert/strict";

import { isBackendSessionUnavailable } from "./sessionAvailability.js";

test("sin refresh token NO es una caída del backend, es sesión terminada", () => {
  assert.equal(isBackendSessionUnavailable(null), false);
  assert.equal(isBackendSessionUnavailable(undefined), false);
});

test("un fallo de transporte sí es una caída", () => {
  assert.equal(isBackendSessionUnavailable({ status: 0 }), true);
});

test("5xx y 429 siguen contando como caída", () => {
  assert.equal(isBackendSessionUnavailable({ status: 500 }), true);
  assert.equal(isBackendSessionUnavailable({ status: 503 }), true);
  assert.equal(isBackendSessionUnavailable({ status: 429 }), true);
});

test("un refresh token rechazado NO es una caída", () => {
  assert.equal(isBackendSessionUnavailable({ status: 401 }), false);
  assert.equal(isBackendSessionUnavailable({ status: 400 }), false);
});
