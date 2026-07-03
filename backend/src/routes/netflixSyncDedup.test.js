import assert from "node:assert/strict";
import test from "node:test";
import { syncDedupKey } from "./netflixSyncDedup.js";

test("episode-level key groups the same episode within a 12h bucket", () => {
  const a = syncDedupKey({ tmdbId: 1, mediaType: "tv", season: 1, episode: 2, watchedAt: "2026-07-03T00:30:00Z" });
  const b = syncDedupKey({ tmdbId: 1, mediaType: "tv", season: 1, episode: 2, watchedAt: "2026-07-03T11:30:00Z" });
  assert.equal(a, b);
  assert.ok(a.startsWith("ep:tv:1:1:2:"));
});

test("episode-level key differs for a different episode", () => {
  const a = syncDedupKey({ tmdbId: 1, mediaType: "tv", season: 1, episode: 2, watchedAt: "2026-07-03T00:30:00Z" });
  const b = syncDedupKey({ tmdbId: 1, mediaType: "tv", season: 1, episode: 3, watchedAt: "2026-07-03T00:30:00Z" });
  assert.notEqual(a, b);
});

test("show-level key (episode null) groups by day", () => {
  const a = syncDedupKey({ tmdbId: 9, mediaType: "tv", season: null, episode: null, watchedAt: "2026-07-03T01:00:00Z" });
  const b = syncDedupKey({ tmdbId: 9, mediaType: "tv", season: null, episode: null, watchedAt: "2026-07-03T23:00:00Z" });
  assert.equal(a, b);
  assert.equal(a, "show:tv:9:2026-07-03");
});

test("show-level key differs across days", () => {
  const a = syncDedupKey({ tmdbId: 9, mediaType: "tv", season: null, episode: null, watchedAt: "2026-07-03T23:00:00Z" });
  const b = syncDedupKey({ tmdbId: 9, mediaType: "tv", season: null, episode: null, watchedAt: "2026-07-04T01:00:00Z" });
  assert.notEqual(a, b);
});
