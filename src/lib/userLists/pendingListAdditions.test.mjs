import assert from "node:assert/strict";
import test from "node:test";

import {
  mergePendingTmdbListItems,
  mergePendingTmdbItems,
  pendingItemKey,
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
