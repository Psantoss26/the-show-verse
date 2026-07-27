import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeHistoryTopSnapshot,
  selectHistoryCacheEnvelope,
} from "./historyCacheSnapshot.js";

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
    }),
    [optimistic],
  );
});
