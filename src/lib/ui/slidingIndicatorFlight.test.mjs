import assert from "node:assert/strict";
import test from "node:test";
import { recordSlide, resumableSlide } from "./slidingIndicatorFlight.js";

const from = { left: 4, width: 40 };
const to = { left: 48, width: 40 };

test("el selector de la página nueva retoma el deslizamiento que empezó el toque", () => {
  const flights = new Map();
  recordSlide(flights, "history-sections", { key: "/continue-watching", from, to, startedAt: 1000 });
  // La página nueva llega a los 200 ms: la pastilla sigue el mismo
  // deslizamiento (mismo origen y mismo instante de inicio), no salta al final.
  assert.deepEqual(resumableSlide(flights, "history-sections", "/continue-watching", 1200, 460), {
    from,
    startedAt: 1000,
  });
});

test("no retoma un deslizamiento ya terminado, de otra sección u otro grupo", () => {
  const flights = new Map();
  recordSlide(flights, "history-sections", { key: "/continue-watching", from, to, startedAt: 1000 });
  assert.equal(resumableSlide(flights, "history-sections", "/continue-watching", 1460, 460), null);
  assert.equal(resumableSlide(flights, "history-sections", "/history", 1100, 460), null);
  assert.equal(resumableSlide(flights, "watching-sections", "/continue-watching", 1100, 460), null);
  assert.equal(resumableSlide(flights, "history-sections", "/continue-watching", null, 460), null);
});
