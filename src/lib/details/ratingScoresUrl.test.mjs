import test from "node:test";
import assert from "node:assert/strict";
import { ratingScoreSourcesFor, ratingScoresTargetFromPath, ratingScoresUrl } from "./ratingScoresUrl.js";

test("una URL estable por fuente; Letterboxd solo en películas", () => {
  assert.deepEqual(ratingScoreSourcesFor("movie"), ["rt", "mc", "lb"]);
  assert.deepEqual(ratingScoreSourcesFor("tv"), ["rt", "mc"]);
  assert.deepEqual(ratingScoreSourcesFor("person"), []);
  assert.equal(ratingScoresUrl("movie", 27205, "rt"), "/api/links/ratings/scores?type=movie&tmdbId=27205&source=rt");
});

test("solo las fichas de película o serie arrancan la lectura al tocar", () => {
  assert.deepEqual(ratingScoresTargetFromPath("/details/movie/27205"), { type: "movie", tmdbId: "27205" });
  assert.deepEqual(ratingScoresTargetFromPath("/details/tv/1396/"), { type: "tv", tmdbId: "1396" });
  for (const path of ["/details/tv/1396/season/1", "/details/person/1", "/details/movie/abc", "/lists"]) {
    assert.equal(ratingScoresTargetFromPath(path), null);
  }
});
