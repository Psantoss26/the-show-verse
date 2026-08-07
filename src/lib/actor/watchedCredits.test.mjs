import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBackendWatchedMap,
  buildTraktWatchedMap,
  watchedKey,
} from "./watchedCredits.js";

test("indexes canonical backend history without requiring a Trakt payload", () => {
  const watched = buildBackendWatchedMap([
    {
      tmdbId: 1399,
      mediaType: "tv",
      watchedAt: "2026-01-02T12:00:00.000Z",
      season: 1,
      episode: 1,
    },
    {
      tmdbId: 1399,
      mediaType: "tv",
      watchedAt: "2026-03-04T12:00:00.000Z",
      season: 1,
      episode: 2,
    },
    {
      tmdbId: 155,
      mediaType: "movie",
      watchedAt: "2026-02-03T12:00:00.000Z",
    },
  ]);

  assert.deepEqual(watched.get("tv:1399"), {
    plays: 2,
    last_watched_at: "2026-03-04T12:00:00.000Z",
  });
  assert.deepEqual(watched.get("movie:155"), {
    plays: 1,
    last_watched_at: "2026-02-03T12:00:00.000Z",
  });
});

test("accepts backend snake_case fields and ignores invalid history rows", () => {
  const watched = buildBackendWatchedMap([
    {
      tmdb_id: 550,
      media_type: "movie",
      watched_at: "2026-05-06T12:00:00.000Z",
    },
    { tmdbId: null, mediaType: "movie" },
    { tmdbId: 10, mediaType: "episode" },
  ]);

  assert.equal(watched.size, 1);
  assert.equal(watched.get("movie:550")?.plays, 1);
});

test("preserves the existing Trakt watched response compatibility", () => {
  const watched = buildTraktWatchedMap(
    [
      {
        plays: 3,
        last_watched_at: "2026-06-07T12:00:00.000Z",
        movie: { ids: { tmdb: 680 } },
      },
    ],
    "movie",
  );

  assert.equal(watchedKey("show", 1399), "tv:1399");
  assert.equal(watched.get("movie:680")?.plays, 3);
});
