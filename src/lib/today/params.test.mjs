import assert from "node:assert/strict";
import test from "node:test";

import { defaultSocialLanding, implicitSocialEntry } from "./params.js";

const days = (today, week) => [
  { key: "today", count: today },
  { key: "2026-10-27", count: 0 },
  { key: "week", count: week },
];

test("defaultSocialLanding: Hoy con actividad se queda en Hoy", () => {
  assert.equal(defaultSocialLanding(days(3, 10)), "today");
});

test("defaultSocialLanding: Hoy vacío y Semana con actividad salta a Semana", () => {
  assert.equal(defaultSocialLanding(days(0, 4)), "week");
});

test("defaultSocialLanding: sin nada en la semana pasa a Siguiendo", () => {
  assert.equal(defaultSocialLanding(days(0, 0)), "activity");
});

test("defaultSocialLanding: sin recuentos no se mueve", () => {
  assert.equal(defaultSocialLanding(null), "today");
  assert.equal(defaultSocialLanding([]), "today");
});

test("implicitSocialEntry: solo sin día, vista ni historia", () => {
  assert.deepEqual(implicitSocialEntry({}), { day: true, view: true });
  assert.deepEqual(implicitSocialEntry({ scope: "community" }), { day: true, view: false });
  assert.deepEqual(implicitSocialEntry({ day: "today" }), { day: false, view: false });
  assert.deepEqual(implicitSocialEntry({ view: "today" }), { day: false, view: false });
  assert.deepEqual(implicitSocialEntry({ story: "x" }), { day: false, view: false });
});
