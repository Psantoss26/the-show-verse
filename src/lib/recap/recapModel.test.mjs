import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRecapSlides,
  criticLine,
  flagEmoji,
  formatDay,
  milestoneTiles,
  previousYearLine,
  soundtrackSubjects,
  tmdbImg,
} from "./recapModel.js";

const FULL = {
  year: 2026,
  empty: false,
  totals: { minutes: 6000, titles: 20 },
  topTitle: { key: "tv:1" },
  shows: { top: [{ key: "tv:1" }, { key: "tv:2" }] },
  movies: { top: [{ key: "movie:3" }] },
  genres: { top: [{ name: "Drama" }] },
  firstOfYear: { key: "movie:3" },
  lastOfYear: { key: "tv:1" },
  binge: { episodes: 4 },
  rhythm: { reliable: true },
  monthly: { peak: { month: 2 } },
  ratings: { count: 2 },
  eras: { decades: [{ decade: 2000 }] },
  world: { languages: [{ code: "en" }], distinctCountries: 1 },
  people: { actors: [], directors: [] },
  milestones: { newShows: 1, newMovies: 2, favoritesAdded: 3 },
  persona: { id: "fiel" },
};

test("un año vacío no tiene pantallas", () => {
  assert.deepEqual(buildRecapSlides({ empty: true }), []);
  assert.deepEqual(buildRecapSlides(null), []);
});

test("las pantallas sin datos suficientes se omiten", () => {
  const ids = buildRecapSlides(FULL).map((slide) => slide.id);
  assert.equal(ids[0], "intro");
  assert.equal(ids.at(-1), "summary");
  assert.ok(ids.includes("topShows"));
  // Una sola película: hay película del año pero no top.
  assert.ok(ids.includes("topMovie"));
  assert.ok(!ids.includes("topMovies"));
  // Menos de 3 notas, un solo idioma y sin repartos: fuera.
  assert.ok(!ids.includes("ratings"));
  assert.ok(!ids.includes("world"));
  assert.ok(!ids.includes("people"));
  assert.ok(ids.includes("milestones"));
});

test("cada pantalla de título hace sonar su banda sonora", () => {
  const slides = buildRecapSlides(FULL);
  assert.equal(slides.find((s) => s.id === "topMovie").sound, "movie:3");
  assert.equal(slides.find((s) => s.id === "minutes").sound, "tv:1");
  const subjects = soundtrackSubjects(
    { topTitle: { key: "tv:1", title: "A" }, shows: FULL.shows, movies: { top: [{ key: "movie:3", title: "B" }] } },
    slides,
  );
  assert.deepEqual(subjects.map((s) => s.key), ["tv:1", "movie:3"]);
});

test("hitos: solo los que tienen valor", () => {
  assert.deepEqual(milestoneTiles(FULL).map((t) => t.id), ["newShows", "newMovies", "favorites"]);
});

test("formatos", () => {
  assert.equal(tmdbImg("/a.jpg", "w500"), "https://image.tmdb.org/t/p/w500/a.jpg");
  assert.equal(tmdbImg(null), null);
  assert.equal(flagEmoji("es"), "🇪🇸");
  assert.equal(flagEmoji("XYZ"), "");
  assert.equal(formatDay("2026-03-12"), "12 de marzo");
  assert.match(previousYearLine({ year: 2026, previous: { minutesDelta: 23 } }), /23 % más que en 2025/);
  assert.equal(previousYearLine({ year: 2026, previous: null }), null);
  assert.match(criticLine(-0.84), /0,8 puntos más exigente/);
});

test("cada pantalla usa la canción que reparte el backend", () => {
  const recap = {
    ...FULL,
    soundtrack: {
      bySlide: { intro: "tv:1", minutes: "tv:1", genres: "tv:9", binge: "movie:8" },
      cards: { "tv:9": { key: "tv:9", title: "Nueve" }, "movie:8": { key: "movie:8", title: "Ocho" }, "tv:1": { key: "tv:1", title: "Uno" } },
    },
  };
  const slides = buildRecapSlides(recap);
  assert.equal(slides.find((s) => s.id === "genres").sound, "tv:9");
  assert.equal(slides.find((s) => s.id === "binge").sound, "movie:8");
  // Sin reparto para esa pantalla: el título del año.
  assert.equal(slides.find((s) => s.id === "split").sound, "tv:1");
  const subjects = soundtrackSubjects(recap, slides).map((s) => s.key);
  assert.ok(subjects.includes("tv:9") && subjects.includes("movie:8"));
});
