import assert from "node:assert/strict";
import test from "node:test";

import { isOwnedComment } from "./commentOwnership.js";

test("identifies native reviews by the signed-in Show Verse username", () => {
  assert.equal(
    isOwnedComment(
      { id: "native-review", user: { username: "PSANTOS26" } },
      { appUsername: "psantos26" },
    ),
    true,
  );
});

test("keeps a just-published review owned before auth state has hydrated", () => {
  assert.equal(
    isOwnedComment(
      { id: "new-review", user: { username: "new-user" } },
      { ownedCommentIds: new Set(["new-review"]) },
    ),
    true,
  );
});

test("does not include reviews authored by another user", () => {
  assert.equal(
    isOwnedComment(
      { id: "other-review", user: { username: "someone-else" } },
      { appUsername: "psantos26", traktUsername: "pablo-trakt" },
    ),
    false,
  );
});
