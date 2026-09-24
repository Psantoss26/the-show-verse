import assert from "node:assert/strict";
import test from "node:test";

import {
  addDismissed,
  alertsTimeline,
  countUnread,
  episodeCode,
  normalizeAlerts,
  platformLabel,
  relativeTime,
  upcomingRelease,
} from "./alerts.js";

const alerts = normalizeAlerts({
  reminders: [
    { id: "r1", createdAt: "2026-09-20T10:00:00Z" },
    { id: "r2", createdAt: "2026-09-18T10:00:00Z" },
  ],
  events: [{ id: "a1", createdAt: "2026-09-21T10:00:00Z" }],
  actions: [{ id: "x1", createdAt: "2026-09-19T10:00:00Z" }],
});

test("no leídas: solo lo posterior a la última apertura", () => {
  assert.equal(countUnread(alerts, null), 4);
  assert.equal(countUnread(alerts, "2026-09-19T12:00:00Z"), 2);
  assert.equal(countUnread(alerts, "2026-09-22T00:00:00Z"), 0);
});

test("los recordatorios descartados no se muestran", () => {
  const out = normalizeAlerts({ reminders: [{ id: "r1" }, { id: "r2" }] }, new Set(["r1"]));
  assert.deepEqual(out.reminders.map((r) => r.id), ["r2"]);
  assert.deepEqual(out.actions, []);
  assert.deepEqual(normalizeAlerts(null).events, []);
});

test("descartados: sin duplicados y con tope", () => {
  assert.deepEqual(addDismissed(["a", "b"], "a"), ["b", "a"]);
  const many = Array.from({ length: 250 }, (_, i) => `id${i}`);
  const out = addDismissed(many, "nuevo");
  assert.equal(out.length, 200);
  assert.equal(out.at(-1), "nuevo");
});

test("código de episodio y tiempo relativo como en el perfil", () => {
  assert.equal(episodeCode({ season: 1, episode: 3 }), "S01E03 de ");
  assert.equal(episodeCode({ season: 2, episode: null }), "");
  const now = Date.parse("2026-09-24T12:00:00Z");
  assert.equal(relativeTime("2026-09-24T11:59:40Z", now), "Ahora");
  assert.equal(relativeTime("2026-09-24T09:00:00Z", now), "hace 3 h");
  assert.equal(relativeTime("2026-09-21T12:00:00Z", now), "hace 3 d");
  assert.match(relativeTime("2026-09-01T12:00:00Z", now), /1 sept/);
});

test("plataforma legible y estreno futuro", () => {
  assert.equal(platformLabel("primevideo"), "Prime Video");
  assert.equal(platformLabel("Netflix"), "Netflix");
  assert.equal(platformLabel("com.desconocida"), null);
  const now = Date.parse("2026-09-24T12:00:00Z");
  assert.equal(upcomingRelease("2020-01-01", now), null);
  assert.match(upcomingRelease("2027-12-12", now), /12 dic 2027/);
  assert.equal(upcomingRelease("", now), null);
});

test("una sola lista, de lo más reciente a lo más antiguo", () => {
  const out = alertsTimeline({
    reminders: [{ id: "r", createdAt: "2026-09-20T10:00:00Z" }],
    events: [{ id: "e-old", createdAt: "2026-09-01T10:00:00Z" }, { id: "e", createdAt: "2026-09-20T10:00:00Z" }],
    actions: [{ id: "a-new", createdAt: "2026-09-24T09:00:00Z" }, { id: "a", createdAt: "2026-09-20T10:00:00Z" }],
  });
  // Lo último que ha pasado va primero aunque sea "actividad"; a igualdad de
  // hora: lo automático, lo que hiciste y lo pendiente.
  assert.deepEqual(out.map((r) => r.item.id), ["a-new", "e", "a", "r", "e-old"]);
  assert.deepEqual(out.map((r) => r.kind), ["action", "event", "action", "reminder", "event"]);
  assert.deepEqual(alertsTimeline(null), []);
});
