import { test } from "node:test";
import assert from "node:assert/strict";

import { formatRuntime, normalizeTitleMetaKey, pickTitleMeta, titleMetaKey } from "./titleMeta.js";

test("claves de título: solo movie/tv con id numérico", () => {
  assert.equal(normalizeTitleMetaKey("movie:603"), "movie:603");
  assert.equal(normalizeTitleMetaKey(" tv:1396 "), "tv:1396");
  assert.equal(normalizeTitleMetaKey("person:1"), null);
  assert.equal(normalizeTitleMetaKey("movie:abc"), null);
  assert.equal(titleMetaKey("tv", 1396), "tv:1396");
  assert.equal(titleMetaKey(undefined, 603), "movie:603");
  assert.equal(titleMetaKey("movie", null), null);
});

test("película: dos primeros géneros y duración", () => {
  const meta = pickTitleMeta(
    { genres: [{ name: "Acción" }, { name: "Ciencia ficción" }, { name: "Drama" }], runtime: 136, release_date: "1999-03-30" },
    "movie",
  );
  assert.deepEqual(meta, { genres: ["Acción", "Ciencia ficción"], runtime: 136, year: "1999" });
});

test("serie: géneros de TV traducidos y duración del episodio", () => {
  const meta = pickTitleMeta(
    { genres: [{ name: "Sci-Fi & Fantasy" }, { name: "Drama" }], episode_run_time: [], last_episode_to_air: { runtime: 47 }, first_air_date: "2011-04-17" },
    "tv",
  );
  assert.deepEqual(meta, { genres: ["Ciencia ficción y fantasía", "Drama"], runtime: 47, year: "2011" });
});

test("sin duración ni géneros", () => {
  assert.deepEqual(pickTitleMeta({ runtime: 0 }, "movie"), { genres: [], runtime: null, year: "" });
});

test("formato de duración", () => {
  assert.equal(formatRuntime(148), "2 h 28 min");
  assert.equal(formatRuntime(120), "2 h");
  assert.equal(formatRuntime(45), "45 min");
  assert.equal(formatRuntime(null), "");
  assert.equal(formatRuntime(0), "");
});
