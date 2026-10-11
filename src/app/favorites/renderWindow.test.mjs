import test from "node:test";
import assert from "node:assert/strict";
import { windowFavoriteGroups, favoriteGroupRenderEnd } from "./renderWindow.mjs";

const groups = [
  { key: "a", items: [1, 2, 3] },
  { key: "b", items: [3, 4, 5], subgroups: [
    { key: "b1", items: [3, 4] },
    { key: "b2", items: [5] },
  ] },
  { key: "c", items: [6] },
];

test("initial batch excludes offscreen group and subgroup headings", () => {
  const result = windowFavoriteGroups(groups, 4);
  assert.deepEqual(result.map(group => group.key), ["a", "b"]);
  assert.equal(result[1].count, 3);
  assert.deepEqual(result[1].subgroups, [{ key: "b1", items: [3], count: 2 }]);
  assert.equal(groups[1].subgroups[0].items.length, 2);
});

test("exact boundaries do not mount empty headings", () => {
  assert.equal(windowFavoriteGroups(groups, 3).length, 1);
  assert.equal(windowFavoriteGroups(groups, 5)[1].subgroups.length, 1);
  assert.deepEqual(windowFavoriteGroups(groups, 0), []);
  assert.equal(windowFavoriteGroups(null, 24), null);
});

test("navigation counts duplicate occurrences and includes the entire destination", () => {
  assert.equal(favoriteGroupRenderEnd(groups, "b"), 6);
  assert.equal(favoriteGroupRenderEnd(groups, "missing"), 0);
  const result = windowFavoriteGroups(groups, favoriteGroupRenderEnd(groups, "b"));
  assert.equal(result.length, 2);
  assert.equal(result[1].subgroups.length, 2);
});

test("back navigation renders all cards and retains counts", () => {
  const result = windowFavoriteGroups(groups, Number.MAX_SAFE_INTEGER);
  assert.equal(result.length, groups.length);
  assert.equal(result[1].subgroups[1].count, 1);
  assert.deepEqual(result[2].items, [6]);
});

test("large grouped lists mount only headings within the initial window", () => {
  const large = Array.from({ length: 1000 }, (_, key) => ({ key, items: [key] }));
  assert.equal(windowFavoriteGroups(large, 24).length, 24);
});
