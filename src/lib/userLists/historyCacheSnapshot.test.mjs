import assert from "node:assert/strict";
import test from "node:test";

import {
  historyEntryMatchesTarget,
  mergeHistoryTopSnapshot,
  selectHistoryCacheEnvelope,
} from "./historyCacheSnapshot.js";
import {
  cacheAddHistory,
  cacheRemoveHistory,
  cacheRemoveHistoryItem,
} from "./optimisticListCache.js";

const HISTORY_CACHE_KEY = "showverse:history:items:v4";

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("uses the persisted optimistic history update when its snapshot time matches memory", () => {
  const memory = {
    t: 100,
    items: [{ history_id: "old" }],
    hasMore: true,
    nextPage: 3,
  };
  const persisted = {
    t: 100,
    items: [
      { history_id: "optimistic:new", _optimistic: true },
      { history_id: "old" },
    ],
    hasMore: true,
    nextPage: 3,
  };

  assert.equal(selectHistoryCacheEnvelope(memory, persisted), persisted);
});

test("keeps the newer in-memory history when localStorage contains an older partial list", () => {
  const memory = {
    t: 200,
    items: Array.from({ length: 400 }, (_, index) => ({
      history_id: `memory:${index}`,
    })),
    hasMore: true,
    nextPage: 3,
  };
  const persisted = {
    t: 100,
    items: Array.from({ length: 200 }, (_, index) => ({
      history_id: `persisted:${index}`,
    })),
    hasMore: true,
    nextPage: 2,
  };

  assert.equal(selectHistoryCacheEnvelope(memory, persisted), memory);
});

test("falls back to whichever valid history snapshot exists", () => {
  const memory = { t: 100, items: [] };
  const persisted = { t: 200, items: [] };

  assert.equal(selectHistoryCacheEnvelope(memory, null), memory);
  assert.equal(selectHistoryCacheEnvelope(null, persisted), persisted);
  assert.equal(selectHistoryCacheEnvelope(null, null), null);
});

test("replaces a confirmed optimistic play without losing older cached pages", () => {
  const previous = [
    {
      history_id: "optimistic:9",
      tmdbId: 9,
      watched_at: "2026-07-27T10:00:00.000Z",
      _optimistic: true,
    },
    {
      history_id: "older-page",
      tmdbId: 4,
      watched_at: "2025-01-01T10:00:00.000Z",
    },
  ];
  const fresh = [
    {
      history_id: "canonical:9",
      tmdbId: 9,
      watched_at: "2026-07-27T10:00:02.000Z",
    },
  ];
  const keyOf = (item) =>
    `${item.tmdbId}:${String(item.watched_at).slice(0, 10)}`;

  assert.deepEqual(
    mergeHistoryTopSnapshot(previous, fresh, {
      idOf: (item) => item.history_id,
      optimisticKeyOf: keyOf,
    }).map((item) => item.history_id),
    ["older-page", "canonical:9"],
  );
});

test("keeps an optimistic play when the fresh top page has not confirmed it yet", () => {
  const optimistic = {
    history_id: "optimistic:9",
    tmdbId: 9,
    watched_at: "2026-07-27T10:00:00.000Z",
    _optimistic: true,
  };

  assert.deepEqual(
    mergeHistoryTopSnapshot([optimistic], [], {
      idOf: (item) => item.history_id,
      optimisticKeyOf: (item) =>
        `${item.tmdbId}:${String(item.watched_at).slice(0, 10)}`,
      now: new Date("2026-07-27T10:01:00.000Z").getTime(),
    }),
    [optimistic],
  );
});

test("drops an expired optimistic play once an authoritative refresh still does not contain it", () => {
  const optimistic = {
    history_id: "optimistic:9",
    tmdbId: 9,
    watched_at: "2026-07-27T10:00:00.000Z",
    _optimistic: true,
  };

  assert.deepEqual(
    mergeHistoryTopSnapshot([optimistic], [], {
      idOf: (item) => item.history_id,
      optimisticKeyOf: (item) =>
        `${item.tmdbId}:${String(item.watched_at).slice(0, 10)}`,
      now: new Date("2026-07-27T10:10:00.000Z").getTime(),
      optimisticGraceMs: 5 * 60 * 1000,
      freshHasMore: false,
    }),
    [],
  );
});

test("removes stale canonical entries from the refreshed top window but preserves older pages", () => {
  const previous = [
    {
      history_id: "deleted-on-server",
      watched_at: "2026-07-27T10:00:00.000Z",
    },
    {
      history_id: "older-page",
      watched_at: "2025-01-01T10:00:00.000Z",
    },
  ];
  const fresh = [
    {
      history_id: "current-top",
      watched_at: "2026-07-27T09:00:00.000Z",
    },
  ];

  assert.deepEqual(
    mergeHistoryTopSnapshot(previous, fresh, {
      idOf: (item) => item.history_id,
      optimisticKeyOf: () => null,
      freshHasMore: true,
    }).map((item) => item.history_id),
    ["older-page", "current-top"],
  );
});

test("stores the canonical history id returned by the add mutation", () => {
  const storage = createMemoryStorage({
    [HISTORY_CACHE_KEY]: JSON.stringify({
      t: 100,
      items: [],
      hasMore: false,
      nextPage: 1,
    }),
  });
  globalThis.window = {
    localStorage: storage,
    dispatchEvent() {},
  };

  try {
    cacheAddHistory({
      type: "movie",
      tmdbId: 453,
      watchedAt: "2026-07-27",
      title: "Disclosure Day",
      historyId: "canonical-play",
    });

    const snapshot = JSON.parse(storage.getItem(HISTORY_CACHE_KEY));
    assert.equal(snapshot.items[0].history_id, "canonical-play");
    assert.equal(snapshot.items[0]._optimistic, false);
  } finally {
    delete globalThis.window;
  }
});

test("matches a movie removed from DetailsClient against its canonical history entry", () => {
  const entry = {
    type: "movie",
    movie: { ids: { tmdb: 453 } },
    history_id: "movie-play",
  };

  assert.equal(
    historyEntryMatchesTarget(entry, { mediaType: "movie", tmdbId: 453 }),
    true,
  );
  assert.equal(
    historyEntryMatchesTarget(entry, { mediaType: "tv", tmdbId: 453 }),
    false,
  );
});

test("matches episode, season and complete-show removals against TV history entries", () => {
  const episode = {
    type: "episode",
    show: { ids: { tmdb: 1399 } },
    episode: { season: 6, number: 4 },
    history_id: "episode-play",
  };

  assert.equal(
    historyEntryMatchesTarget(episode, {
      mediaType: "tv",
      tmdbId: 1399,
      season: 6,
      episode: 4,
    }),
    true,
  );
  assert.equal(
    historyEntryMatchesTarget(episode, {
      mediaType: "tv",
      tmdbId: 1399,
      season: 6,
    }),
    true,
  );
  assert.equal(
    historyEntryMatchesTarget(episode, {
      mediaType: "tv",
      tmdbId: 1399,
    }),
    true,
  );
  assert.equal(
    historyEntryMatchesTarget(episode, {
      mediaType: "tv",
      tmdbId: 1399,
      season: 6,
      episode: 5,
    }),
    false,
  );
});

test("matches the optimistic TV shape used before returning from DetailsClient", () => {
  const optimistic = {
    type: "tv",
    tmdbId: 1399,
    season: 1,
    episode_number: 2,
    _optimistic: true,
  };

  assert.equal(
    historyEntryMatchesTarget(optimistic, {
      mediaType: "show",
      tmdbId: 1399,
      season: 1,
      episode: 2,
    }),
    true,
  );
});

test("removes DetailsClient targets from the persisted History snapshot before back navigation", () => {
  const storage = createMemoryStorage({
    [HISTORY_CACHE_KEY]: JSON.stringify({
      t: 100,
      items: [
        {
          type: "movie",
          movie: { ids: { tmdb: 453 } },
          history_id: "movie-play",
        },
        {
          type: "episode",
          show: { ids: { tmdb: 1399 } },
          episode: { season: 6, number: 4 },
          history_id: "episode-play",
        },
        {
          type: "episode",
          show: { ids: { tmdb: 1399 } },
          episode: { season: 6, number: 5 },
          history_id: "other-episode",
        },
      ],
      hasMore: true,
      nextPage: 2,
    }),
  });
  const events = [];
  globalThis.window = {
    localStorage: storage,
    dispatchEvent(event) {
      events.push(event);
    },
  };

  try {
    cacheRemoveHistoryItem({
      type: "tv",
      tmdbId: 1399,
      season: 6,
      episode: 4,
    });
    cacheRemoveHistory("movie-play");

    const snapshot = JSON.parse(storage.getItem(HISTORY_CACHE_KEY));
    assert.deepEqual(
      snapshot.items.map((item) => item.history_id),
      ["other-episode"],
    );
    assert.equal(events.length, 2);
    assert.equal(events[0].detail.added, false);
    assert.deepEqual(events[0].detail.listTypes, ["history", "watched"]);
  } finally {
    delete globalThis.window;
  }
});
