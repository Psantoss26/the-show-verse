import { test } from "node:test";
import assert from "node:assert/strict";

import { countryFlag, countryName, formatMs, formatPercent, statusTone, timeAgo } from "./adminFormat.js";

test("formatMs pasa a segundos desde 1000 ms", () => {
  assert.equal(formatMs(42.4), "42 ms");
  assert.equal(formatMs(1500), "1.5 s");
  assert.equal(formatMs(12000), "12 s");
});

test("formatPercent no divide entre cero", () => {
  assert.equal(formatPercent(1, 0), "0 %");
  assert.equal(formatPercent(1, 40), "2.5 %");
  assert.equal(formatPercent(1, 3), "33 %");
});

test("timeAgo en segundos, minutos, horas y días", () => {
  const now = Date.parse("2026-11-19T12:00:00Z");
  assert.equal(timeAgo("2026-11-19T11:59:30Z", now), "hace 30 s");
  assert.equal(timeAgo("2026-11-19T11:30:00Z", now), "hace 30 min");
  assert.equal(timeAgo("2026-11-19T07:00:00Z", now), "hace 5 h");
  assert.equal(timeAgo("2026-11-15T12:00:00Z", now), "hace 4 d");
  assert.equal(timeAgo("nope", now), "");
});

test("countryFlag y countryName con códigos de Cloudflare", () => {
  assert.equal(countryFlag("es"), "🇪🇸");
  assert.equal(countryFlag("XX"), "🌐");
  assert.equal(countryFlag("??"), "🌐");
  assert.equal(countryName("ES"), "España");
  assert.equal(countryName("T1"), "Tor");
  assert.equal(countryName("??"), "Desconocido");
});

test("statusTone por familia de código", () => {
  assert.equal(statusTone(200), "text-emerald-300");
  assert.equal(statusTone(404), "text-amber-300");
  assert.equal(statusTone(503), "text-red-400");
});
