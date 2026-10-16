import assert from "node:assert/strict";
import test from "node:test";

import {
  buildListMembershipMap,
  mergeOwnedComments,
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

test("keeps the user's own review even when it is not on the visible comments page", () => {
  const page = [
    { id: "popular", user: { username: "someone-else" } },
    { id: "mine-edited", comment: "editada", user: { username: "psantos26" } },
  ];
  const viewerComments = [
    { id: "mine-edited", comment: "original", user: { username: "psantos26" } },
    { id: "mine-old", user: { username: "psantos26" } },
  ];

  const merged = mergeOwnedComments(viewerComments, page, {
    appUsername: "psantos26",
  });
  assert.deepEqual(merged.map((comment) => comment.id), ["mine-edited", "mine-old"]);
  assert.equal(merged[0].comment, "editada");
  assert.deepEqual(mergeOwnedComments(viewerComments, [], {}).length, 2);
  assert.deepEqual(mergeOwnedComments(null, page, {}), []);
});
