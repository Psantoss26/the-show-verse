import assert from "node:assert/strict";
import test from "node:test";

import { unwrapCommentResponse } from "./commentResponse.js";

test("unwraps the native community comment response before it reaches the UI", () => {
  const comment = {
    id: "5a14b39a-b0cb-4f13-a1e2-3b8af2bcf861",
    comment: "Una reseña publicada correctamente.",
    spoiler: false,
    user: { username: "pablo" },
  };

  assert.equal(unwrapCommentResponse({ comment }), comment);
});

test("preserves a comment item when the API already returns it directly", () => {
  const comment = { id: "comment-id", comment: "Texto", spoiler: true };

  assert.equal(unwrapCommentResponse(comment), comment);
});
