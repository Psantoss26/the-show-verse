import assert from "node:assert/strict";
import test from "node:test";

import {
  AWARDS_NEGATIVE_TTL_MS,
  awardsRetryDelayMs,
  emptyAwardsResponse,
  isTransientAwardsError,
  isTransientAwardsStatus,
} from "./awardsHttp.js";

test("treats TMDb awards 504 as transient", () => {
  assert.equal(isTransientAwardsStatus(504), true);
  assert.equal(isTransientAwardsStatus(429), true);
  assert.equal(isTransientAwardsStatus(404), false);
  assert.equal(isTransientAwardsStatus(401), false);
});

test("treats awards fetch aborts and connect timeouts as transient", () => {
  assert.equal(isTransientAwardsError({ name: "AbortError" }), true);
  assert.equal(
    isTransientAwardsError({
      name: "TypeError",
      cause: { code: "UND_ERR_CONNECT_TIMEOUT" },
    }),
    true,
  );
  assert.equal(isTransientAwardsError(new Error("parse failed")), false);
});

test("empty awards response stays successful and marked optional", () => {
  const data = emptyAwardsResponse({
    sourceUrl: "https://www.themoviedb.org/movie/1/awards",
    type: "movie",
    id: 1,
    unavailable: true,
  });

  assert.equal(data.source, "tmdb");
  assert.equal(data.type, "movie");
  assert.equal(data.id, "1");
  assert.equal(data.hasAwards, false);
  assert.equal(data.unavailable, true);
  assert.deepEqual(data.groups, []);
});

test("negative cache and retry delay stay short for optional awards data", () => {
  assert.equal(AWARDS_NEGATIVE_TTL_MS, 5 * 60 * 1000);
  assert.equal(awardsRetryDelayMs(0), 250);
  assert.equal(awardsRetryDelayMs(1), 500);
});
