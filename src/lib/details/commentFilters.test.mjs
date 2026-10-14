import assert from "node:assert/strict";
import test from "node:test";

import {
  COMMENT_TABS,
  commentFiltersKey,
  commentFiltersQuery,
  normalizeCommentFilters,
} from "./commentFilters.js";

test("dos pestañas: Populares y Recientes", () => {
  assert.deepEqual(COMMENT_TABS.map((tab) => tab.label), ["Populares", "Recientes"]);
});

test("los filtros antiguos guardados pasan a los nuevos", () => {
  assert.deepEqual(normalizeCommentFilters("likes30"), { tab: "recent", byLikes: true });
  assert.deepEqual(normalizeCommentFilters("likesAll"), { tab: "popular", byLikes: false });
  assert.deepEqual(normalizeCommentFilters("recent", true), { tab: "recent", byLikes: true });
  assert.deepEqual(normalizeCommentFilters("cualquiera"), { tab: "popular", byLikes: false });
});

test("consulta y clave de caché por combinación", () => {
  assert.equal(commentFiltersQuery({ tab: "popular", byLikes: false }), "tab=popular");
  assert.equal(commentFiltersQuery({ tab: "recent", byLikes: true }), "tab=recent&sort=likes");
  assert.equal(commentFiltersKey({ tab: "popular", byLikes: true }), "popular:likes");
  assert.equal(commentFiltersKey({ tab: "recent" }), "recent");
});
