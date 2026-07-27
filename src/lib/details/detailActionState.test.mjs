import assert from "node:assert/strict";
import test from "node:test";

import {
  buildListMembershipMap,
  selectOwnedComments,
} from "./detailActionState.js";

test("restores list membership for the exact title and media type", () => {
  assert.deepEqual(
    buildListMembershipMap(
      [
        {
          listId: "movies",
          items: [{ id: 1399, media_type: "movie" }],
        },
        {
          listId: "shows",
          items: [{ id: 1399, media_type: "tv" }],
        },
      ],
      { tmdbId: 1399, mediaType: "tv" },
    ),
    { movies: false, shows: true },
  );
});

test("selects persisted and newly published reviews owned by the user", () => {
  const comments = [
    { id: "native", user: { username: "PSANTOS26" } },
    { id: "just-published", user: { username: "pending-profile" } },
    { id: "other", user: { username: "someone-else" } },
  ];

  assert.deepEqual(
    selectOwnedComments(comments, {
      appUsername: "psantos26",
      ownedCommentIds: new Set(["just-published"]),
    }).map((comment) => comment.id),
    ["native", "just-published"],
  );
});
