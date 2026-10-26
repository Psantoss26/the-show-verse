import assert from "node:assert/strict";
import test from "node:test";

import { findLocalProgress } from "./progressClient.js";

const rows = [
  { id: "a", tmdbId: 95479, mediaType: "tv", season: 1, episode: 32, percent: 0.4 },
  { id: "b", tmdbId: 95479, mediaType: "tv", season: 1, episode: 33, percent: 0.1 },
  { id: "c", tmdbId: 398978, mediaType: "movie", season: 0, episode: 0, percent: 0.5 },
];

test("findLocalProgress: la película por su id y tipo", () => {
  assert.equal(findLocalProgress(rows, { tmdbId: 398978, mediaType: "movie" })?.id, "c");
  assert.equal(findLocalProgress(rows, { tmdbId: 398978, mediaType: "tv" }), null);
});

test("findLocalProgress: el episodio concreto, no otro de la misma serie", () => {
  assert.equal(findLocalProgress(rows, { tmdbId: 95479, mediaType: "tv", season: 1, episode: 33 })?.id, "b");
  assert.equal(findLocalProgress(rows, { tmdbId: 95479, mediaType: "tv", season: 2, episode: 32 }), null);
  assert.equal(findLocalProgress(null, { tmdbId: 1, mediaType: "movie" }), null);
});
