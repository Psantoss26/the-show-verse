import assert from "node:assert/strict";
import test from "node:test";

import {
  activityMarks,
  episodeLabel,
  primaryMark,
  joinNames,
  relativeTime,
  statusLabel,
  summaryChips,
  summarySentence,
} from "./followingActivity.js";

const person = (name, extra = {}) => ({ user: { username: name.toLowerCase(), displayName: name }, ...extra });

test("nombres en castellano natural", () => {
  assert.equal(joinNames([person("Ana")]), "Ana");
  assert.equal(joinNames([person("Ana"), person("Luis")]), "Ana y Luis");
  assert.equal(joinNames([person("Ana"), person("Luis"), person("Eva")]), "Ana, Luis y Eva");
  assert.equal(joinNames([1, 2, 3, 4, 5].map((n) => person(`P${n}`))), "P1, P2 y 3 más");
});

test("frase de la cabecera: visto antes que pendiente", () => {
  const watched = person("Ana", { watched: { plays: 1 }, status: "watched" });
  const planned = person("Luis", { watchlist: true, status: "planned" });
  assert.equal(summarySentence({ items: [watched, planned] }), "Ana la ha visto");
  assert.equal(summarySentence({ items: [planned] }), "Luis la tiene pendiente");
  const watching = person("Eva", { watched: { episodes: 3 }, status: "watching" });
  assert.equal(summarySentence({ items: [watching] }), "Eva la está viendo");
  assert.equal(summarySentence({ items: [] }), "");
});

test("chips: media de notas, pendientes y reseñas", () => {
  const items = [person("Ana", { watched: { plays: 1 }, watchlist: true }), person("Luis", { watchlist: true })];
  const chips = summaryChips({ summary: { averageRating: 8.25, rated: 2, watched: 1, watching: 0, watchlist: 2, reviews: 0 }, items });
  // Ana ya la vio: solo cuenta Luis como pendiente.
  assert.deepEqual(chips.map((c) => c.label), ["8,3", "1 la tiene pendiente"]);
});

test("estados y episodios", () => {
  assert.equal(statusLabel({ status: "rewatched", watched: { plays: 3 } }).text, "Vista 3 veces");
  assert.equal(statusLabel({ status: "watching" }, "tv").tone, "sky");
  assert.equal(episodeLabel({ season: 2, episode: 5 }), "T2 · E5");
  assert.equal(episodeLabel(null), null);
});

test("fecha relativa y sin fecha fiable", () => {
  const now = Date.parse("2026-10-01T12:00:00Z");
  assert.equal(relativeTime("2026-09-28T12:00:00Z", now), "hace 3 días");
  assert.equal(relativeTime("2026-09-30T12:00:00Z", now), "ayer");
  assert.equal(relativeTime(null, now), null);
});

test("marcas con el lenguaje de la actividad y la del avatar", () => {
  const rated = person("Ana", { status: "watched", watched: { plays: 1 }, rating: 8, favorite: true });
  assert.deepEqual(activityMarks(rated).map((m) => m.id), ["rating", "watched", "favorite"]);
  assert.equal(primaryMark(rated).id, "rating");
  assert.equal(primaryMark(rated).value, "8");
  // Serie sin nota que está viendo: "viéndola", aunque también la tenga pendiente.
  const watching = person("Luis", { status: "watching", watched: { episodes: 3 }, watchlist: true });
  assert.equal(primaryMark(watching, "tv").id, "watching");
  assert.ok(!activityMarks(watching, "tv").some((m) => m.id === "watchlist"));
  // Solo pendiente.
  assert.equal(primaryMark(person("Eva", { status: "planned", watchlist: true })).id, "watchlist");
  // Película vista sin nota: el ojo.
  assert.equal(primaryMark(person("Leo", { status: "rewatched", watched: { plays: 2 } })).label, "Vista 2 veces");
});
