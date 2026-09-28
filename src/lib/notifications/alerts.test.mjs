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

import { freshAlertGroups } from "./alerts.js";

test("ventanas emergentes: lo nuevo desde que se abrió, por título y sin repetir", () => {
  const alerts = {
    events: [
      { id: "auto:1", type: "auto_watched", tmdbId: 1, mediaType: "tv", createdAt: "2026-09-28T10:05:00Z" },
      { id: "old", type: "cw_added", tmdbId: 2, mediaType: "tv", createdAt: "2026-09-28T09:00:00Z" },
    ],
    reminders: [
      { id: "r1", tmdbId: 1, mediaType: "tv", createdAt: "2026-09-28T10:05:00Z" },
      { id: "r2", tmdbId: 3, mediaType: "movie", createdAt: "2026-09-28T10:01:00Z" },
    ],
    actions: [{ id: "a", type: "watched", tmdbId: 4, mediaType: "movie", createdAt: "2026-09-28T10:06:00Z" }],
  };
  const groups = freshAlertGroups(alerts, { since: "2026-09-28T10:00:00Z", shown: new Set(["r2"]) });
  assert.deepEqual(
    groups.map((g) => [g.key, g.rows.map((r) => r.item.id)]),
    [["tv:1", ["auto:1", "r1"]], ["movie:4", ["a"]]],
  );

  // Lo hecho en este dispositivo ya se avisó al hacerlo.
  const withoutLocal = freshAlertGroups(alerts, {
    since: "2026-09-28T10:00:00Z",
    shown: new Set(["r2"]),
    skip: (item) => item.tmdbId === 4,
  });
  assert.deepEqual(withoutLocal.map((g) => g.key), ["tv:1"]);
});

import { describeAlertGroup } from "./alerts.js";

test("ventanas emergentes: texto del grupo sin el título", () => {
  const content = describeAlertGroup([
    { kind: "event", item: { id: "e", type: "auto_watched", tmdbId: 1, mediaType: "tv", season: 1, episode: 3, title: "Dark", posterPath: "/d.jpg" } },
    { kind: "reminder", item: { id: "r", tmdbId: 1, mediaType: "tv", season: 1, episode: 3, needsRating: true, needsReview: false } },
  ]);
  assert.equal(content.icon, "autoWatched");
  assert.equal(content.label, "Visto");
  assert.equal(content.title, "Dark");
  assert.equal(content.text, "Has terminado S01E03. Puntúa el episodio S01E03");
  assert.equal(content.posterPath, "/d.jpg");
  assert.equal(content.target.id, "r");
});
