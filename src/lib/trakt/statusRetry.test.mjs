import test from "node:test";
import assert from "node:assert/strict";
import { statusRetryDelay } from "./statusRetry.js";

test("los reintentos crecen y cubren la ventana de un minuto del rate limit", () => {
  const primeros = [1, 2, 3, 4, 5, 6].map(statusRetryDelay);
  for (let i = 1; i < primeros.length; i += 1) {
    assert.ok(primeros[i] > primeros[i - 1]);
  }
  const acumulado = primeros.reduce((sum, ms) => sum + ms, 0);
  assert.ok(acumulado > 60000, `acumulado ${acumulado}ms`);
});

test("no se agotan: a partir del último intento se mantiene la espera máxima", () => {
  assert.equal(statusRetryDelay(50), statusRetryDelay(6));
  assert.equal(statusRetryDelay(0), statusRetryDelay(1));
});
