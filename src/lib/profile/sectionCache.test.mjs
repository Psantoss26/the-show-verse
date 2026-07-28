import assert from "node:assert/strict";
import test from "node:test";

import { profileSectionCacheKey } from "./sectionCache.js";

test("activity invalidates snapshots created before final English posters", () => {
  assert.equal(
    profileSectionCacheKey("Psantos26", "activity"),
    "psantos26:activity:v3",
  );
});

test("all poster sections share the final-English-poster cache version", () => {
  for (const section of ["favorites", "ratings", "watched", "watchlist"]) {
    assert.equal(
      profileSectionCacheKey("Psantos26", section),
      `psantos26:${section}:v3`,
    );
  }
});

test("sections without title posters retain their existing cache version", () => {
  assert.equal(
    profileSectionCacheKey("Psantos26", "social"),
    "psantos26:social:v1",
  );
});
