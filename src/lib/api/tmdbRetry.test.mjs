import assert from "node:assert/strict";
import test from "node:test";

import {
  getTmdbRetryDelayMs,
  isHeavyTmdbPayload,
  isTmdbNotFound,
  isTmdbTransientError,
  isTmdbTransientStatus,
} from "./tmdbRetry.js";

test("classifies TMDb 404/status_code 34 as not found only", () => {
  assert.equal(isTmdbNotFound(404, {}), true);
  assert.equal(isTmdbNotFound(200, { status_code: 34 }), true);
  assert.equal(isTmdbNotFound(429, {}), false);
  assert.equal(isTmdbNotFound(500, {}), false);
});

test("retries TMDb rate limits and server failures", () => {
  assert.equal(isTmdbTransientStatus(429), true);
  assert.equal(isTmdbTransientStatus(500), true);
  assert.equal(isTmdbTransientStatus(503), true);
  assert.equal(isTmdbTransientStatus(401), false);
});

test("retries aborts and network timeouts from the TMDb fetch layer", () => {
  assert.equal(isTmdbTransientError({ name: "AbortError" }), true);
  assert.equal(
    isTmdbTransientError({ name: "TypeError", cause: { code: "UND_ERR_CONNECT_TIMEOUT" } }),
    true,
  );
  assert.equal(isTmdbTransientError({ code: "ECONNRESET" }), true);
  assert.equal(isTmdbTransientError(new Error("bad json")), false);
});

test("uses Retry-After when present and caps long waits", () => {
  assert.equal(getTmdbRetryDelayMs({ attempt: 0, retryAfter: "2" }), 2000);
  assert.equal(getTmdbRetryDelayMs({ attempt: 0, retryAfter: "120" }), 8000);
  assert.equal(getTmdbRetryDelayMs({ attempt: 2 }), 1000);
});

test("detects heavy TMDb payloads without slowing lightweight lists", () => {
  assert.equal(
    isHeavyTmdbPayload("/movie/550", {
      append_to_response: "external_ids,credits,videos,images",
    }),
    true,
  );
  assert.equal(isHeavyTmdbPayload("/tv/1399/images"), true);
  assert.equal(isHeavyTmdbPayload("/discover/movie", { page: 1 }), false);
  assert.equal(isHeavyTmdbPayload("/trending/tv/week"), false);
});
