import assert from "node:assert/strict";
import test from "node:test";

import { resolveUserListInitialSnapshot } from "./backNavigationSnapshot.js";

test("restores a valid stale snapshot when returning with browser history", () => {
  assert.deepEqual(
    resolveUserListInitialSnapshot(
      { fresh: false, items: [{ id: 1 }] },
      true,
    ),
    {
      hasBackNavigationSnapshot: true,
      shouldRestoreSnapshot: true,
    },
  );
});

test("keeps stale snapshots hidden on a normal page entry", () => {
  assert.deepEqual(
    resolveUserListInitialSnapshot(
      { fresh: false, items: [{ id: 1 }] },
      false,
    ),
    {
      hasBackNavigationSnapshot: false,
      shouldRestoreSnapshot: false,
    },
  );
});

test("does not invent a restorable snapshot when the cache is empty", () => {
  assert.deepEqual(
    resolveUserListInitialSnapshot({ fresh: true, items: [] }, true),
    {
      hasBackNavigationSnapshot: false,
      shouldRestoreSnapshot: false,
    },
  );
});
