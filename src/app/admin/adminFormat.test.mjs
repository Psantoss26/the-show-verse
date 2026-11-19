import { test } from "node:test";
import assert from "node:assert/strict";

import {
  bucketLabel,
  compareToPrevious,
  countryFlag,
  countryName,
  deltaTone,
  filterRecent,
  formatCompact,
  formatDelta,
  formatMs,
  formatPercent,
  rate,
  statusFamilies,
  statusTone,
  timeAgo,
  tooltipLabel,
} from "./adminFormat.js";

const NB = " ";

test("formatMs pasa a segundos desde 1000 ms con coma decimal", () => {
  assert.equal(formatMs(42.4), `42${NB}ms`);
  assert.equal(formatMs(1500), `1,5${NB}s`);
  assert.equal(formatMs(12000), `12${NB}s`);
  assert.equal(formatMs(null), "—");
});

test("formatPercent no divide entre cero y usa coma decimal", () => {
  assert.equal(formatPercent(1, 0), `0${NB}%`);
  assert.equal(formatPercent(1, 40), `2,5${NB}%`);
  assert.equal(formatPercent(1, 3), `33${NB}%`);
  assert.equal(formatPercent(0, 10), `0${NB}%`);
  assert.equal(rate(1, 0), null);
  assert.equal(rate(1, 4), 0.25);
});

test("formatCompact abrevia miles y millones", () => {
  assert.equal(formatCompact(950), "950");
  assert.equal(formatCompact(12345), `12,3${NB}mil`);
  assert.equal(formatCompact(undefined), "0");
});

test("compareToPrevious: sin datos, nuevo, subida, bajada y estable", () => {
  assert.equal(compareToPrevious(0, 0), null);
  assert.equal(compareToPrevious(5, undefined), null);
  assert.deepEqual(compareToPrevious(5, 0), { kind: "new" });
  assert.deepEqual(compareToPrevious(150, 100), { kind: "change", pct: 50, direction: "up" });
  assert.deepEqual(compareToPrevious(0, 100), { kind: "change", pct: -100, direction: "down" });
  assert.equal(compareToPrevious(1002, 1000).direction, "flat");
});

test("formatDelta y deltaTone según si subir es bueno o malo", () => {
  assert.equal(formatDelta(null), "");
  assert.equal(formatDelta({ kind: "new" }), "nuevo");
  assert.equal(formatDelta({ kind: "change", pct: 50, direction: "up" }), `+50${NB}%`);
  assert.equal(formatDelta({ kind: "change", pct: -3.44, direction: "down" }), `−3,4${NB}%`);
  assert.equal(formatDelta({ kind: "change", pct: 0.1, direction: "flat" }), `=${NB}0${NB}%`);
  assert.equal(deltaTone({ kind: "change", direction: "up" }, "up-good"), "good");
  assert.equal(deltaTone({ kind: "change", direction: "up" }, "up-bad"), "bad");
  assert.equal(deltaTone({ kind: "change", direction: "down" }, "up-bad"), "good");
  assert.equal(deltaTone({ kind: "change", direction: "flat" }, "up-bad"), "neutral");
  assert.equal(deltaTone({ kind: "new" }, "up-good"), "neutral");
  assert.equal(deltaTone(null, "up-good"), "neutral");
});

test("statusFamilies agrupa por familia en orden fijo", () => {
  assert.deepEqual(
    statusFamilies([
      { status: 404, count: 3 },
      { status: 200, count: 10 },
      { status: 500, count: 1 },
      { status: 401, count: 2 },
    ]),
    [
      { family: "2xx", tone: "ok", count: 10, codes: [{ status: 200, count: 10 }] },
      { family: "4xx", tone: "client", count: 5, codes: [{ status: 404, count: 3 }, { status: 401, count: 2 }] },
      { family: "5xx", tone: "server", count: 1, codes: [{ status: 500, count: 1 }] },
    ],
  );
  assert.deepEqual(statusFamilies([]), []);
});

test("timeAgo en segundos, minutos, horas y días", () => {
  const now = Date.parse("2026-11-19T12:00:00Z");
  assert.equal(timeAgo("2026-11-19T11:59:58Z", now), "ahora");
  assert.equal(timeAgo("2026-11-19T11:59:30Z", now), "hace 30 s");
  assert.equal(timeAgo("2026-11-19T11:30:00Z", now), "hace 30 min");
  assert.equal(timeAgo("2026-11-19T07:00:00Z", now), "hace 5 h");
  assert.equal(timeAgo("2026-11-15T12:00:00Z", now), "hace 4 d");
  assert.equal(timeAgo("2026-11-19T12:00:10Z", now), "ahora");
  assert.equal(timeAgo("nope", now), "");
});

test("bucketLabel y tooltipLabel en hora de Madrid", () => {
  // 23:00 UTC del 18 = medianoche del 19 en Madrid.
  assert.equal(bucketLabel("2026-11-18T23:00:00Z", "day"), "19 nov");
  assert.equal(bucketLabel("2026-11-19T13:05:00Z", "minute"), "14:05");
  assert.equal(tooltipLabel("2026-11-19T13:00:00Z", "hour"), "jue 19 nov · 14:00–15:00");
  assert.equal(tooltipLabel("2026-11-18T23:00:00Z", "day"), "jueves, 19 nov");
  assert.equal(bucketLabel("nope", "day"), "");
});

test("filterRecent por tipo", () => {
  const rows = [
    { status: 200, userId: "a" },
    { status: 404, userId: null },
    { status: 502, userId: "b" },
  ];
  assert.equal(filterRecent(rows, "all").length, 3);
  assert.deepEqual(filterRecent(rows, "errors").map((r) => r.status), [404, 502]);
  assert.deepEqual(filterRecent(rows, "users").map((r) => r.status), [200, 502]);
  assert.deepEqual(filterRecent(rows, "anonymous").map((r) => r.status), [404]);
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
  assert.equal(statusTone(200), "ok");
  assert.equal(statusTone(304), "redirect");
  assert.equal(statusTone(404), "client");
  assert.equal(statusTone(503), "server");
});
