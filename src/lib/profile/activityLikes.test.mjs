import assert from "node:assert/strict";
import test from "node:test";

import {
  activityActionKey,
  isLikeActivity,
  likeAuthor,
  likeTargetHref,
  likeTargetName,
  likeVerb,
} from "./activityLikes.js";

test("los tres me gusta son una sola acción para filtrar y agrupar", () => {
  assert.equal(activityActionKey({ type: "like_review" }), "like");
  assert.equal(activityActionKey({ type: "like_list" }), "like");
  assert.equal(activityActionKey({ type: "like_collection" }), "like");
  assert.equal(activityActionKey({ type: "list_item" }), "list");
  assert.equal(activityActionKey({ type: "rating" }), "rating");
  assert.equal(isLikeActivity({ type: "favorite" }), false);
});

test("enlaces, nombres y autores", () => {
  assert.equal(likeTargetHref({ type: "like_list", listId: "a b" }), "/lists/community/a%20b");
  assert.equal(likeTargetHref({ type: "like_collection", collectionId: 10 }), "/lists/collection/10");
  assert.equal(likeTargetHref({ type: "like_collection", collectionId: "x" }), null);
  assert.equal(likeTargetHref({ type: "like_review", tmdbId: 603 }), null);

  assert.equal(likeTargetName({ type: "like_collection", name: null }), "Colección");
  assert.equal(likeTargetName({ type: "like_collection", name: "Dune - Colección" }), "Dune");
  assert.equal(likeTargetName({ type: "like_collection", name: "The Matrix Collection" }), "The Matrix Collection");
  assert.equal(likeTargetName({ type: "like_review", title: "Matrix" }), "Matrix");

  assert.deepEqual(likeAuthor({ type: "like_review", reviewAuthor: { name: "Ana", username: "ana" } }), { name: "Ana", href: "/u/ana" });
  assert.deepEqual(likeAuthor({ type: "like_list", listOwner: { name: "Trakt user", username: null } }), { name: "Trakt user", href: null });
  assert.equal(likeAuthor({ type: "like_collection" }), null);
});

test("verbos en tercera y primera persona", () => {
  assert.equal(likeVerb({ type: "like_list" }), "ha dado me gusta a la lista");
  assert.equal(likeVerb({ type: "like_review" }, { firstPerson: true }), "Has dado me gusta a una reseña de");
  assert.equal(likeVerb({ type: "watched" }), null);
});
