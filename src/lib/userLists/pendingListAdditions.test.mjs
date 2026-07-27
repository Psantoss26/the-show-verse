import assert from "node:assert/strict";
import test from "node:test";

import {
  filterPendingHistoryRemovals,
  getPendingHistoryRemovals,
  getPendingListChanges,
  mergeFreshDiaryItems,
  mergeFreshProfileListItems,
  mergePendingProfileListItems,
  mergePendingTmdbListItems,
  mergePendingTmdbItems,
  pendingItemKey,
  prunePendingListChanges,
  recordPendingHistoryRemoval,
  recordPendingListChange,
} from "./pendingListAdditions.js";

test("merges recent additions into the first standalone-list render", () => {
  const current = [
    { id: 1, media_type: "movie", title: "Anterior", _addedIndex: 0 },
    { id: 2, media_type: "tv", name: "Eliminada", _addedIndex: 1 },
  ];
  const changes = {
    additions: [{
      key: pendingItemKey("movie", 9),
      tmdbId: 9,
      mediaType: "movie",
      title: "Nueva",
      posterPath: "/nueva.jpg",
      at: 20,
    }],
    removedKeys: new Set([pendingItemKey("tv", 2)]),
  };

  const result = mergePendingTmdbItems(current, changes);

  assert.deepEqual(result.map((item) => item.id), [9, 1]);
  assert.equal(result[0].poster_path, "/nueva.jpg");
  assert.ok(result[0]._addedIndex < result[1]._addedIndex);
});

test("does not duplicate a pending title already confirmed by fresh data", () => {
  const current = [
    { id: 9, media_type: "movie", title: "Nueva", _addedIndex: 0 },
  ];
  const result = mergePendingTmdbItems(current, {
    additions: [{
      key: pendingItemKey("movie", 9),
      tmdbId: 9,
      mediaType: "movie",
      title: "Nueva",
      at: 20,
    }],
  });

  assert.equal(result, current);
  assert.equal(result.length, 1);
});

test("standalone favorites consumes the persisted pending addition in its first batch", () => {
  const storage = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
    },
  };

  try {
    recordPendingListChange("favorites", {
      tmdbId: 9,
      mediaType: "movie",
      title: "Nueva",
      posterPath: "/nueva.jpg",
    }, true);

    const firstBatch = mergePendingTmdbListItems([
      { id: 1, media_type: "movie", title: "Anterior", _addedIndex: 0 },
    ], "favorites");

    assert.deepEqual(firstBatch.map((item) => item.id), [9, 1]);
  } finally {
    delete globalThis.window;
  }
});

test("Profile Favorites and Watchlist apply additions and removals before painting cached content", () => {
  for (const section of ["favorites", "watchlist"]) {
    const current = [
      {
        tmdbId: 1,
        mediaType: "movie",
        title: "Anterior",
        addedAt: "2026-07-26T10:00:00.000Z",
      },
      {
        tmdbId: 2,
        mediaType: "tv",
        title: "Eliminada",
        addedAt: "2026-07-25T10:00:00.000Z",
      },
    ];
    const result = mergePendingProfileListItems(current, section, {
      additions: [{
        key: pendingItemKey("movie", 9),
        tmdbId: 9,
        mediaType: "movie",
        title: "Nueva",
        posterPath: "/nueva.jpg",
        at: Date.parse("2026-07-27T10:00:00.000Z"),
      }],
      removedKeys: new Set([pendingItemKey("tv", 2)]),
    });

    assert.deepEqual(result.map((item) => item.tmdbId), [9, 1]);
    assert.equal(result[0].title, "Nueva");
    assert.equal(result[0].posterPath, "/nueva.jpg");
  }
});

test("Profile Ratings updates an existing score without duplicating its title", () => {
  const current = [{
    id: "rating-row",
    tmdbId: 453,
    mediaType: "movie",
    title: "La película",
    posterPath: "/poster.jpg",
    rating: 7,
    ratedAt: "2026-07-20T10:00:00.000Z",
  }];
  const result = mergePendingProfileListItems(current, "ratings", {
    additions: [{
      key: pendingItemKey("movie", 453),
      tmdbId: 453,
      mediaType: "movie",
      rating: 9,
      at: Date.parse("2026-07-27T10:00:00.000Z"),
    }],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].id, "rating-row");
  assert.equal(result[0].title, "La película");
  assert.equal(result[0].posterPath, "/poster.jpg");
  assert.equal(result[0].rating, 9);
  assert.equal(result[0].ratedAt, "2026-07-27T10:00:00.000Z");
});

test("Profile list revalidation replaces the fresh window and preserves older cached pages", () => {
  const cached = [
    {
      tmdbId: 1,
      mediaType: "movie",
      addedAt: "2026-07-27T10:00:00.000Z",
    },
    {
      tmdbId: 2,
      mediaType: "tv",
      addedAt: "2026-07-27T09:00:00.000Z",
    },
    {
      tmdbId: 3,
      mediaType: "movie",
      addedAt: "2025-01-01T10:00:00.000Z",
    },
  ];
  const fresh = [
    {
      tmdbId: 4,
      mediaType: "movie",
      addedAt: "2026-07-27T11:00:00.000Z",
    },
    {
      tmdbId: 2,
      mediaType: "tv",
      addedAt: "2026-07-27T09:00:00.000Z",
    },
  ];

  assert.deepEqual(
    mergeFreshProfileListItems(cached, fresh, {
      freshHasMore: true,
    }).map((item) => item.tmdbId),
    [4, 2, 3],
  );
});

test("Profile keeps removal tombstones until a paginated snapshot is complete", () => {
  const storage = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
    },
  };

  try {
    recordPendingListChange("favorites", {
      tmdbId: 453,
      mediaType: "movie",
    }, false);

    prunePendingListChanges("favorites", new Set(), {
      completeSnapshot: false,
    });
    assert.equal(
      getPendingListChanges("favorites").removedKeys.has(
        pendingItemKey("movie", 453),
      ),
      true,
    );

    prunePendingListChanges("favorites", new Set(), {
      completeSnapshot: true,
    });
    assert.equal(
      getPendingListChanges("favorites").removedKeys.size,
      0,
    );
  } finally {
    delete globalThis.window;
  }
});

test("persists an exact history removal so Profile Diary filters its cached record on return", () => {
  const storage = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
    },
  };

  try {
    recordPendingHistoryRemoval({ historyId: "play-2" });
    const removals = getPendingHistoryRemovals();
    const cachedDiary = [
      { id: "play-1", tmdbId: 9, mediaType: "movie" },
      { id: "play-2", tmdbId: 10, mediaType: "movie" },
    ];

    assert.deepEqual(
      filterPendingHistoryRemovals(cachedDiary, removals).map(
        (item) => item.id,
      ),
      ["play-1"],
    );
  } finally {
    delete globalThis.window;
  }
});

test("filters a complete title or a specific episode from cached Profile Diary records", () => {
  const cachedDiary = [
    {
      id: "movie-play",
      tmdbId: 453,
      mediaType: "movie",
    },
    {
      id: "episode-1",
      tmdbId: 1399,
      mediaType: "tv",
      season: 1,
      episode: 1,
    },
    {
      id: "episode-2",
      tmdbId: 1399,
      mediaType: "tv",
      season: 1,
      episode: 2,
    },
  ];

  assert.deepEqual(
    filterPendingHistoryRemovals(cachedDiary, [
      { mediaType: "movie", tmdbId: 453 },
      { mediaType: "tv", tmdbId: 1399, season: 1, episode: 1 },
    ]).map((item) => item.id),
    ["episode-2"],
  );
});

test("silently reconciles the fresh Diary top without losing older cached pages", () => {
  const cachedDiary = [
    {
      id: "deleted-on-server",
      watchedAt: "2026-07-27T10:00:00.000Z",
    },
    {
      id: "still-current",
      watchedAt: "2026-07-27T09:00:00.000Z",
    },
    {
      id: "older-page",
      watchedAt: "2025-01-01T10:00:00.000Z",
    },
  ];
  const freshTop = [
    {
      id: "new-record",
      watchedAt: "2026-07-27T11:00:00.000Z",
    },
    {
      id: "still-current",
      watchedAt: "2026-07-27T09:00:00.000Z",
    },
  ];

  assert.deepEqual(
    mergeFreshDiaryItems(cachedDiary, freshTop, {
      freshHasMore: true,
    }).map((item) => item.id),
    ["new-record", "still-current", "older-page"],
  );
});
