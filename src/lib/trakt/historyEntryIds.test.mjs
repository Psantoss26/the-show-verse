import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyHistoryEntryIds,
  normalizeHistoryEntryIds,
} from "./historyEntryIds.js";

test("preserves backend UUID history ids instead of coercing them to numbers", () => {
  const id = "550e8400-e29b-41d4-a716-446655440000";

  assert.deepEqual(normalizeHistoryEntryIds([id]), [id]);
  assert.deepEqual(classifyHistoryEntryIds([id]), {
    kind: "backend",
    ids: [id],
  });
});

test("keeps numeric Trakt history ids on the Trakt path", () => {
  assert.deepEqual(classifyHistoryEntryIds(["123", 456]), {
    kind: "trakt",
    ids: [123, 456],
  });
});

test("rejects mixed or malformed history id batches", () => {
  const uuid = "550e8400-e29b-41d4-a716-446655440000";

  assert.equal(classifyHistoryEntryIds([uuid, "123"]).kind, "invalid");
  assert.equal(classifyHistoryEntryIds(["not-an-id"]).kind, "invalid");
});
