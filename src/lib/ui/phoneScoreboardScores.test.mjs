import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PHONE_SCORES,
  PHONE_SCORES_KEY,
  PHONE_SCORES_MAX,
  getPhoneScores,
  isPhoneScoreAllowed,
  phoneScoreOptionsFor,
  phoneScoresFor,
  placePhoneScore,
  removePhoneScore,
  replacePhoneScore,
  sanitizePhoneScores,
  withPhoneScores,
} from "./phoneScoreboardScores.js";

const DEFAULT = ["tmdb", "trakt", "imdb"];

test("por defecto: TMDb, Trakt e IMDb en películas y series", () => {
  assert.deepEqual(DEFAULT_PHONE_SCORES, { movie: DEFAULT, tv: DEFAULT });
  assert.deepEqual(getPhoneScores(null), { movie: DEFAULT, tv: DEFAULT });
  assert.deepEqual(getPhoneScores({ uiSettings: {} }), { movie: DEFAULT, tv: DEFAULT });
});

test("respeta el orden elegido en cada tipo", () => {
  const prefs = { uiSettings: { [PHONE_SCORES_KEY]: { movie: ["lb", "tmdb"], tv: ["rt", "imdb"] } } };
  assert.deepEqual(phoneScoresFor(getPhoneScores(prefs), "movie"), ["lb", "tmdb"]);
  assert.deepEqual(phoneScoresFor(getPhoneScores(prefs), "tv"), ["rt", "imdb"]);
});

test("descarta claves desconocidas, duplicados, Letterboxd en series y el exceso sobre 4", () => {
  assert.equal(PHONE_SCORES_MAX, 4);
  assert.deepEqual(
    sanitizePhoneScores({ movie: ["tmdb", "tmdb", "foo", "imdb", "rt", "mc", "lb"], tv: ["lb", "mc"] }),
    { movie: ["tmdb", "imdb", "rt", "mc"], tv: ["mc"] },
  );
});

test("lista vacía o inválida vuelve a la de por defecto (por tipo)", () => {
  assert.deepEqual(sanitizePhoneScores({ movie: [], tv: ["lb"] }), { movie: DEFAULT, tv: DEFAULT });
  assert.deepEqual(sanitizePhoneScores("tmdb"), { movie: DEFAULT, tv: DEFAULT });
  assert.deepEqual(sanitizePhoneScores({ movie: ["imdb"] }), { movie: ["imdb"], tv: DEFAULT });
});

test("convierte el formato antiguo de lista única (rtTv = solo series)", () => {
  assert.deepEqual(sanitizePhoneScores(["tmdb", "trakt", "imdb", "rtTv", "lb"]), {
    movie: ["tmdb", "trakt", "imdb", "lb"],
    tv: ["tmdb", "trakt", "imdb", "rt"],
  });
  assert.deepEqual(sanitizePhoneScores(["imdb", "rt"]), { movie: ["imdb", "rt"], tv: ["imdb", "rt"] });
});

test("Letterboxd solo se ofrece para películas", () => {
  assert.equal(isPhoneScoreAllowed("lb", "movie"), true);
  assert.equal(isPhoneScoreAllowed("lb", "tv"), false);
  assert.ok(!phoneScoreOptionsFor("tv").some((o) => o.key === "lb"));
  assert.equal(phoneScoreOptionsFor("movie").length, 6);
});

test("placePhoneScore inserta si hay hueco, sustituye si está llena y mueve si ya estaba", () => {
  assert.deepEqual(placePhoneScore(DEFAULT, "rt", 1, "movie"), ["tmdb", "rt", "trakt", "imdb"]);
  assert.deepEqual(placePhoneScore(DEFAULT, "rt", 3, "movie"), ["tmdb", "trakt", "imdb", "rt"]);
  const full = ["tmdb", "trakt", "imdb", "rt"];
  assert.deepEqual(placePhoneScore(full, "mc", 0, "movie"), ["mc", "trakt", "imdb", "rt"]);
  assert.deepEqual(placePhoneScore(full, "rt", 0, "movie"), ["rt", "tmdb", "trakt", "imdb"]);
  assert.deepEqual(placePhoneScore(DEFAULT, "lb", 0, "tv"), DEFAULT);
});

test("replacePhoneScore cambia una por otra que no estaba", () => {
  assert.deepEqual(replacePhoneScore(DEFAULT, "trakt", "lb", "movie"), ["tmdb", "lb", "imdb"]);
  assert.deepEqual(replacePhoneScore(DEFAULT, "trakt", "imdb", "movie"), DEFAULT);
  assert.deepEqual(replacePhoneScore(DEFAULT, "trakt", "lb", "tv"), DEFAULT);
});

test("removePhoneScore no deja la lista vacía", () => {
  assert.deepEqual(removePhoneScore(DEFAULT, "trakt", "movie"), ["tmdb", "imdb"]);
  assert.deepEqual(removePhoneScore(["imdb"], "imdb", "tv"), ["imdb"]);
});

test("withPhoneScores conserva el resto de uiSettings", () => {
  assert.deepEqual(withPhoneScores({ mobileCardsPerRow: 4 }, { movie: ["imdb", "rt"], tv: ["imdb"] }), {
    mobileCardsPerRow: 4,
    [PHONE_SCORES_KEY]: { movie: ["imdb", "rt"], tv: ["imdb"] },
  });
});
