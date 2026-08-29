import assert from "node:assert/strict";
import test from "node:test";

import {
  formatActivityRatingTarget,
  getActivityDetailsHref,
} from "./activityRatingTarget.js";

test("describe y enlaza las puntuaciones de serie, temporada y episodio", () => {
  assert.equal(
    formatActivityRatingTarget({ mediaType: "tv" }),
    "la serie",
  );
  assert.equal(
    formatActivityRatingTarget({ ratingTarget: "season", season: 2 }),
    "la temporada 2 de",
  );
  assert.equal(
    formatActivityRatingTarget({ ratingTarget: "episode", season: 2, episode: 4 }),
    "el episodio S02E04 de",
  );

  assert.equal(
    getActivityDetailsHref({ type: "rating", mediaType: "tv", tmdbId: 100 }),
    "/details/tv/100",
  );
  assert.equal(
    getActivityDetailsHref({ type: "rating", ratingTarget: "season", tmdbId: 100, season: 2 }),
    "/details/tv/100/season/2",
  );
  assert.equal(
    getActivityDetailsHref({ type: "rating", ratingTarget: "episode", tmdbId: 100, season: 2, episode: 4 }),
    "/details/tv/100/season/2/episode/4",
  );
});
