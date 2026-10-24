import assert from "node:assert/strict";
import test from "node:test";

import {
  dayPartOf,
  isQuietDay,
  pickHeroStory,
  prepareActions,
  summarize,
  toFeedSections,
  toHighlights,
  toMostActive,
  toPersonGroups,
  toStoryGroups,
  toTitleStories,
} from "./stories.js";
import { firstUnseenIndex, hasUnseenFrames, pruneSeen } from "./seenStories.js";

const TZ = "Europe/Madrid";
const ANA = { id: "a", username: "ana", displayName: "Ana" };
const LUIS = { id: "l", username: "luis", displayName: "Luis" };
const SHOW = { type: "tv", tmdbId: 1, title: "Serie" };
const MOVIE = { type: "movie", tmdbId: 2, title: "Película" };
const OTHER = { type: "movie", tmdbId: 3, title: "Otra" };

let n = 0;
function action(user, media, at, extra = {}) {
  n += 1;
  return {
    key: `${extra.kind || "watch"}:${n}`,
    kind: "watch",
    target: media.type === "tv" ? "episode" : "movie",
    user,
    media,
    activityAt: at,
    milestone: null,
    ...extra,
  };
}

test("maratón: los episodios de una persona se funden con el hito más fuerte", () => {
  const prepared = prepareActions([
    action(ANA, SHOW, "2026-10-24T20:00:00Z", { season: 1, episode: 7 }),
    action(ANA, SHOW, "2026-10-24T21:00:00Z", { season: 1, episode: 8, milestone: "season_finale" }),
    action(ANA, SHOW, "2026-10-24T19:00:00Z", { season: 1, episode: 1, milestone: "series_premiere" }),
    action(LUIS, SHOW, "2026-10-24T18:00:00Z", { season: 1, episode: 1 }),
  ]);
  const ana = prepared.find((a) => a.user.id === "a");
  assert.equal(prepared.length, 2);
  assert.equal(ana.episodeCount, 3);
  assert.equal(ana.episode, 8, "se queda el más reciente");
  assert.equal(ana.milestone, "series_premiere");
});

test("la nota de un episodio se pega a su visionado, salvo en maratón", () => {
  const prepared = prepareActions([
    action(ANA, SHOW, "2026-10-24T20:00:00Z", { season: 1, episode: 7 }),
    action(ANA, SHOW, "2026-10-24T20:05:00Z", { kind: "rating", target: "episode", season: 1, episode: 7, rating: 9 }),
    action(LUIS, SHOW, "2026-10-24T20:00:00Z", { season: 1, episode: 1 }),
    action(LUIS, SHOW, "2026-10-24T21:00:00Z", { season: 1, episode: 2 }),
    action(LUIS, SHOW, "2026-10-24T21:05:00Z", { kind: "rating", target: "episode", season: 1, episode: 2, rating: 4 }),
  ]);
  assert.equal(prepared.filter((a) => a.kind === "rating").length, 1, "la de Luis queda suelta");
  assert.equal(prepared.find((a) => a.user.id === "a" && a.kind === "watch").rating, 9);
});

test("historias por título, media de notas y destacada", () => {
  const stories = toTitleStories(prepareActions([
    action(ANA, MOVIE, "2026-10-24T20:00:00Z"),
    action(ANA, MOVIE, "2026-10-24T20:10:00Z", { kind: "rating", target: "movie", rating: 8 }),
    action(LUIS, MOVIE, "2026-10-24T19:10:00Z", { kind: "rating", target: "movie", rating: 6 }),
    action(LUIS, OTHER, "2026-10-24T22:00:00Z"),
  ]));
  assert.deepEqual(stories.map((s) => s.key), ["movie:3", "movie:2"]);
  const movie = stories.find((s) => s.key === "movie:2");
  assert.equal(movie.users.length, 2);
  assert.equal(movie.averageRating, 7);
  assert.equal(pickHeroStory(stories).key, "movie:2", "sin hitos, la que junta a más gente");

  const withFinale = toTitleStories(prepareActions([
    action(ANA, MOVIE, "2026-10-24T20:00:00Z"),
    action(LUIS, MOVIE, "2026-10-24T20:00:00Z"),
    action(ANA, SHOW, "2026-10-24T10:00:00Z", { season: 2, episode: 10, milestone: "series_finale" }),
  ]));
  assert.equal(pickHeroStory(withFinale).key, "tv:1");
  assert.equal(pickHeroStory([]), null);
});

test("destacados: reseña sin spoiler y nota de obra, fuera de la destacada", () => {
  const stories = toTitleStories(prepareActions([
    action(ANA, MOVIE, "2026-10-24T20:00:00Z", { kind: "comment", target: "movie", comment: { body: "Genial" } }),
    action(LUIS, OTHER, "2026-10-24T21:00:00Z", { kind: "comment", target: "movie", comment: { body: "Muere al final", spoiler: true } }),
    action(LUIS, OTHER, "2026-10-24T21:01:00Z", { kind: "rating", target: "movie", rating: 7 }),
  ]));
  const hero = stories.find((s) => s.key === "movie:2");
  const highlights = toHighlights(stories, hero);
  assert.deepEqual(highlights.map((a) => a.kind), ["rating"]);
  assert.equal(toHighlights(stories, null).length, 2);
});

test("personas y más activos", () => {
  const prepared = prepareActions([
    action(ANA, MOVIE, "2026-10-24T20:00:00Z"),
    action(ANA, OTHER, "2026-10-24T21:00:00Z"),
    action(LUIS, MOVIE, "2026-10-24T22:00:00Z"),
  ]);
  const groups = toPersonGroups(prepared);
  assert.equal(groups[0].user.id, "l", "orden por lo más reciente");
  const ranking = toMostActive(groups);
  assert.equal(ranking[0].user.id, "a");
  assert.equal(ranking[0].share, 1);
  assert.equal(ranking[1].share, 0.5);
  assert.equal(ranking[0].titles, 2);
});

test("franjas: la madrugada cuenta como la noche anterior", () => {
  // 01:30 en Madrid del 25 → madrugada del 24.
  const late = dayPartOf("2026-10-24T23:30:00Z", TZ);
  assert.equal(late.day, "2026-10-24");
  assert.equal(late.part.key, "night");
  assert.equal(dayPartOf("2026-10-24T08:00:00Z", TZ).part.key, "morning");
  const sections = toFeedSections([
    action(ANA, MOVIE, "2026-10-24T08:00:00Z"),
    action(ANA, OTHER, "2026-10-24T17:00:00Z"),
    action(LUIS, OTHER, "2026-10-23T17:00:00Z"),
  ], TZ);
  assert.deepEqual(sections.map((s) => s.part), ["evening", "morning", "evening"]);
  assert.equal(sections[0].showDay, true);
});

test("historias del reproductor y vistos", () => {
  const stories = toTitleStories(prepareActions([
    action(ANA, MOVIE, "2026-10-24T20:00:00Z"),
    action(LUIS, MOVIE, "2026-10-24T20:00:00Z"),
    action(LUIS, OTHER, "2026-10-24T21:00:00Z"),
  ]));
  const groups = toStoryGroups(stories, [{ key: "for-you:tv:9", media: SHOW }]);
  assert.deepEqual(groups.map((g) => g.kind), ["for-you", "title", "title"]);
  const movie = groups.find((g) => g.key === "movie:2");
  assert.equal(movie.frames[0].type, "summary");
  assert.equal(movie.frames.length, 3);
  assert.equal(groups.find((g) => g.key === "movie:3").frames.length, 1);

  const seen = { [movie.frames[0].key]: Date.now() };
  assert.equal(hasUnseenFrames(movie, seen), true);
  assert.equal(firstUnseenIndex(movie, seen), 1);
  assert.equal(firstUnseenIndex({ frames: [{ key: "x" }] }, { x: 1 }), 0);
  assert.deepEqual(pruneSeen({ a: 1000, b: 90_000_000 }, 90_000_100), { b: 90_000_000 });
});

test("resumen y día tranquilo", () => {
  assert.deepEqual(summarize([{ user: ANA }, { user: ANA }, { user: LUIS }]), { actions: 3, people: 2 });
  assert.equal(isQuietDay("today", 2), true);
  assert.equal(isQuietDay("today", 0), false);
  assert.equal(isQuietDay("week", 2), false);
});
