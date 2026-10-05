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
  assert.deepEqual(storySceneIds(card, story), ["details", "production"]);
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
  assert.deepEqual(story.plays, { percent: 45, watched: 27, total: 60, last: null, resume: null });
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
  assert.deepEqual(storySceneIds(card, story), ["plays", "review", "details", "production"]);
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

test("continuar viendo: la película a medias sale en visionados con su porcentaje", () => {
  const card = { actions: { rating: null }, scores: {} };
  const unwatched = sanitizeShareStory(
    buildShareStoryPayload({ type: "movie", watched: false, continueWatching: { percent: 42 }, details }),
  );
  assert.deepEqual(unwatched.plays, { count: 0, dates: [], last: null, resume: { percent: 42, season: null, episode: null } });
  assert.equal(storySceneIds(card, unwatched)[0], "plays");

  // Ya vista y revisionándose: conserva las veces y añade el progreso.
  const rewatch = sanitizeShareStory(
    buildShareStoryPayload({ type: "movie", watched: true, plays: 2, continueWatching: { percent: 0.4 * 100 }, details }),
  );
  assert.equal(rewatch.plays.count, 2);
  assert.equal(rewatch.plays.resume.percent, 40);

  // Fuera de 1-99% no cuenta como en curso.
  for (const percent of [0, 100, Number.NaN]) {
    const story = sanitizeShareStory(buildShareStoryPayload({ type: "movie", watched: false, continueWatching: { percent }, details }));
    assert.equal(story.plays, null);
  }
});

test("continuar viendo en una serie: porcentaje con su episodio", () => {
  const story = sanitizeShareStory(
    buildShareStoryPayload({
      type: "tv",
      tvProgress: { percent: 45, watched: 27, total: 60 },
      continueWatching: { percent: 63, season: 2, episode: 3 },
      details,
    }),
  );
  assert.deepEqual(story.plays.resume, { percent: 63, season: 2, episode: 3 });
});

test("series: episodios vistos con su nota de IMDb y la del usuario, solo los vistos", () => {
  const story = sanitizeShareStory(
    buildShareStoryPayload({
      type: "tv",
      tvProgress: { percent: 10, watched: 3, total: 30 },
      watchedBySeason: { 2: [1], 1: [2, 1, 1] },
      episodeImdbRatings: {
        seasons: [
          { season_number: 1, episodes: [{ episode_number: 1, name: "Piloto", vote_average: 8.24 }, { episode_number: 2, name: "Dos", vote_average: 7.9 }, { episode_number: 3, name: "No visto", vote_average: 9.9 }] },
          { season_number: 2, episodes: [{ episode_number: 1, name: "Vuelta", vote_average: null }] },
        ],
      },
      episodeUserRatings: { S1E2: 9, S1E3: 10 },
      details,
    }),
  );
  assert.deepEqual(story.episodes, {
    more: 0,
    items: [
      { season: 1, episode: 1, name: "Piloto", imdb: 8.2, mine: null },
      { season: 1, episode: 2, name: "Dos", imdb: 7.9, mine: 9 },
      { season: 2, episode: 1, name: "Vuelta", imdb: null, mine: null },
    ],
  });
  const card = { actions: { rating: null }, scores: {} };
  assert.deepEqual(storySceneIds(card, story).slice(0, 2), ["plays", "episodes"]);
});

test("series con muchos episodios: los últimos y cuántos más", () => {
  const watchedBySeason = { 1: Array.from({ length: 20 }, (_, i) => i + 1), 2: [1, 2, 3] };
  const story = sanitizeShareStory(buildShareStoryPayload({ type: "tv", watchedBySeason, details }));
  assert.equal(story.episodes.items.length, 14);
  assert.equal(story.episodes.more, 9);
  assert.deepEqual(story.episodes.items.at(-1), { season: 2, episode: 3, name: "", imdb: null, mine: null });
  // Las películas no tienen lista de episodios.
  assert.equal(sanitizeShareStory(buildShareStoryPayload({ type: "movie", watchedBySeason, details })).episodes, null);
});

test("el validador no deja pasar episodios mal formados ni de más", () => {
  const items = [
    ...Array.from({ length: 30 }, (_, i) => ({ season: 1, episode: i + 1, name: "x".repeat(200), imdb: 42, mine: -3 })),
  ];
  const story = sanitizeShareStory({ episodes: { items: [{ season: "a", episode: 1 }, { season: null, episode: 2 }, ...items], more: -5 } });
  assert.equal(story.episodes.items.length, 12);
  assert.equal(story.episodes.items[0].name.length, 60);
  assert.equal(story.episodes.items[0].imdb, 10);
  assert.equal(story.episodes.items[0].mine, null);
  assert.equal(story.episodes.more, 0);
});

test("sin sección de puntuaciones: ya están en la portada", () => {
  const story = sanitizeShareStory(buildShareStoryPayload({ type: "movie", watched: true, plays: 1, details }));
  // Con nota propia (9) y puntuaciones públicas no aparece ninguna sección para ellas.
  const ids = storySceneIds({ actions: { rating: 9 }, scores: { tmdb: { value: "8.4" } } }, story);
  assert.equal(ids.includes("rating"), false);
  assert.deepEqual(ids, ["plays", "details", "production"]);
});

test("detalles y producción: las tarjetas de la ficha, sin huecos", () => {
  const story = sanitizeShareStory(
    buildShareStoryPayload({
      type: "movie",
      details: {
        ...details,
        facts: {
          originalTitle: "Pride & Prejudice",
          release: "16 sept 2005",
          duration: "2h 9m",
          status: "Estrenada",
          budget: "$28.0M",
          revenue: "$121.1M",
          awards: "x".repeat(400),
          production: "Working Title Films",
          network: { evil: true },
          end: "—",
          format: "  ",
          bogus: "nope",
        },
        endLabel: "<script>",
      },
    }),
  );
  const facts = story.details.facts;
  assert.equal(facts.originalTitle, "Pride & Prejudice");
  assert.equal(facts.budget, "$28.0M");
  assert.ok(facts.awards.length <= 140);
  // Objetos, marcadores vacíos y claves desconocidas no pasan.
  assert.equal("network" in facts, false);
  assert.equal("end" in facts, false);
  assert.equal("format" in facts, false);
  assert.equal("bogus" in facts, false);
  assert.equal(story.details.endLabel, "Última emisión");

  // Solo producción: sin datos de la tarjeta «Detalles» no hay esa sección.
  const onlyProduction = sanitizeShareStory({ details: { facts: { budget: "$1.0M" } } });
  assert.deepEqual(storySceneIds({ type: "movie" }, onlyProduction), ["production"]);
  // El canal es de series: en una película no abre «Producción».
  const network = sanitizeShareStory({ details: { facts: { network: "HBO" } } });
  assert.deepEqual(storySceneIds({ type: "movie" }, network), []);
  assert.deepEqual(storySceneIds({ type: "tv" }, network), ["production"]);
});
