import assert from "node:assert/strict";
import test from "node:test";

import {
  buildShareStoryPayload,
  formatRuntime,
  formatStoryDate,
  sanitizeShareStory,
  storyFrame,
  storyFrameCount,
  storySceneIds,
  storyTimeline,
  truncateText,
} from "./shareStory.js";

const details = {
  year: 2005,
  runtime: 129,
  genres: [{ id: 1, name: "Drama" }, { id: 2, name: "Romance" }],
  peopleLabel: "Dirección",
  people: ["Joe Wright"],
  overview: "Elizabeth Bennet conoce al señor Darcy.",
};

const card = {
  actions: { rating: 9 },
  scores: { tmdb: { value: "8.1", votes: "9K" }, trakt: null, imdb: null },
};

test("movie plays: count, newest dates first and duplicates removed", () => {
  const story = sanitizeShareStory(
    buildShareStoryPayload({
      type: "movie",
      watched: true,
      plays: 3,
      history: [
        { watched_at: "2021-02-01T20:00:00.000Z" },
        { watched_at: "2024-03-12T21:00:00.000Z" },
        { watched_at: "2024-03-12T21:00:00.000Z" },
        { watchedAt: "not a date" },
      ],
      details,
    }),
  );
  assert.equal(story.plays.count, 3);
  assert.deepEqual(story.plays.dates, ["2024-03-12T21:00:00.000Z", "2021-02-01T20:00:00.000Z"]);
  assert.equal(story.plays.last, "2024-03-12T21:00:00.000Z");
});

test("unwatched movie has no plays section", () => {
  const story = sanitizeShareStory(buildShareStoryPayload({ type: "movie", watched: false, details }));
  assert.equal(story.plays, null);
  assert.deepEqual(storySceneIds(card, story), ["rating", "details"]);
});

test("series plays use the episode progress", () => {
  const story = sanitizeShareStory(
    buildShareStoryPayload({
      type: "tv",
      watched: true,
      tvProgress: { percent: 45, watched: 27, total: 60 },
      details,
    }),
  );
  assert.deepEqual(story.plays, { percent: 45, watched: 27, total: 60, last: null });
});

test("review is opt-in and never includes spoilers", () => {
  const review = { comment: "Una adaptación preciosa.", created_at: "2024-01-05T10:00:00Z" };
  const off = buildShareStoryPayload({ type: "movie", review, details });
  assert.equal(off.review, null);

  const on = sanitizeShareStory(buildShareStoryPayload({ type: "movie", review, includeReview: true, details }));
  assert.equal(on.review.text, "Una adaptación preciosa.");

  const spoiler = buildShareStoryPayload({ type: "movie", review: { ...review, spoiler: true }, includeReview: true, details });
  assert.equal(spoiler.review, null);
});

test("scenes keep their order and skip what has no data", () => {
  const story = sanitizeShareStory(
    buildShareStoryPayload({
      type: "movie",
      watched: true,
      plays: 1,
      review: { comment: "Muy buena" },
      includeReview: true,
      details,
    }),
  );
  assert.deepEqual(storySceneIds(card, story), ["plays", "rating", "review", "details"]);
  assert.deepEqual(
    storySceneIds({ actions: { rating: null }, scores: {} }, { ...story, details: { genres: [], people: [] } }),
    ["plays", "review"],
  );
});

test("sanitizer clamps and trims untrusted input", () => {
  const story = sanitizeShareStory({
    plays: { count: 1e9, dates: ["2024-01-01", "javascript:alert(1)", "2023-01-01", "2022-01-01", "2021-01-01", "2020-01-01"] },
    review: { text: "palabra ".repeat(200), date: "ayer" },
    details: { year: 99999, genres: Array(10).fill("Drama"), people: ["A".repeat(100)], overview: "x ".repeat(400) },
  });
  assert.equal(story.plays.count, 9999);
  assert.equal(story.plays.dates.length, 4);
  assert.ok(story.review.text.length <= 340);
  assert.ok(story.review.text.endsWith("…"));
  assert.equal(story.review.date, null);
  assert.equal(story.details.year, 2200);
  assert.equal(story.details.genres.length, 4);
  assert.equal(story.details.people[0].length, 40);
  assert.ok(story.details.overview.length <= 260);
});

test("formats dates and runtimes in Spanish", () => {
  assert.equal(formatStoryDate("2024-03-12T21:00:00.000Z"), "12 de marzo de 2024");
  assert.equal(formatRuntime(129), "2 h 9 min");
  assert.equal(formatRuntime(120), "2 h");
  assert.equal(formatRuntime(45), "45 min");
  assert.equal(truncateText("uno dos tres cuatro", 12), "uno dos…");
});

test("timeline: cover first, scenes in sequence, cover again at the end", () => {
  const timeline = storyTimeline(["plays", "rating", "details"]);
  const [plays, rating, detailsScene] = timeline.scenes;
  assert.ok(plays.start > timeline.storyStart);
  // La siguiente entra mientras la anterior sale: nunca hay pantalla vacía.
  assert.ok(Math.abs(rating.start - (plays.end - timeline.timing.overlap)) < 1e-9);
  assert.ok(Math.abs(detailsScene.start - (rating.end - timeline.timing.overlap)) < 1e-9);
  assert.ok(timeline.duration > detailsScene.end);
  assert.equal(storyFrameCount(timeline), Math.round(timeline.duration * 30));

  const start = storyFrame(timeline, 0);
  assert.equal(start.cover.alpha, 1);
  assert.equal(start.cover.scale, 1);
  assert.equal(start.backdrop.alpha, 0);

  const middle = storyFrame(timeline, (rating.start + rating.end) / 2);
  assert.equal(middle.cover.alpha, 0);
  assert.equal(middle.backdrop.alpha, 1);
  assert.deepEqual(
    middle.scenes.map((scene) => [scene.id, scene.alpha]),
    [["plays", 0], ["rating", 1], ["details", 0]],
  );
  assert.equal(middle.scenes[1].offsetY, 0);

  const end = storyFrame(timeline, timeline.duration);
  assert.equal(end.cover.alpha, 1);
  assert.ok(Math.abs(end.cover.scale - 1) < 1e-9, "el último fotograma enlaza con el primero");
  assert.equal(end.backdrop.alpha, 0);
});

test("between two scenes there is always something on screen, but never both at full", () => {
  const timeline = storyTimeline(["plays", "rating", "details"]);
  for (const scene of timeline.scenes.slice(0, -1)) {
    for (let t = scene.end - timeline.timing.exit; t < scene.end + timeline.timing.enter; t += 0.02) {
      const alphas = storyFrame(timeline, t).scenes.map((layer) => layer.alpha).sort((a, b) => b - a);
      assert.ok(alphas[0] > 0.3, `${scene.id} a ${t.toFixed(2)} s: nada visible (${alphas[0].toFixed(2)})`);
      assert.ok(alphas[1] < 0.5, `${scene.id} a ${t.toFixed(2)} s: dos secciones a la vez`);
    }
  }
});

test("scene enters from below and leaves upwards", () => {
  const timeline = storyTimeline(["rating"]);
  const scene = timeline.scenes[0];
  const entering = storyFrame(timeline, scene.start + 0.1).scenes[0];
  const leaving = storyFrame(timeline, scene.end - 0.1).scenes[0];
  assert.ok(entering.offsetY > 0 && entering.alpha < 1);
  assert.ok(leaving.offsetY < 0 && leaving.alpha < 1);
});
