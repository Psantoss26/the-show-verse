import assert from "node:assert/strict";
import test from "node:test";

import {
  getCommunityListDetailsCacheKey,
  resolveCollectionDetailsInitialState,
  resolveCommunityListDetailsInitialState,
  shouldRenderCachedListDuringAuthHydration,
} from "./detailsInitialState.js";

test("hydrates collection details from the cached snapshot before effects run", () => {
  const state = resolveCollectionDetailsInitialState({
    collection: { id: 10, name: "Saga" },
    parts: [{ id: 1, title: "Primera película" }],
  });

  assert.equal(state.loading, false);
  assert.equal(state.collection?.name, "Saga");
  assert.deepEqual(state.parts.map((item) => item.id), [1]);
});

test("keeps collection details in loading state when there is no snapshot", () => {
  const state = resolveCollectionDetailsInitialState(null);

  assert.equal(state.loading, true);
  assert.equal(state.collection, null);
  assert.deepEqual(state.parts, []);
});

test("hydrates community list details from the cached snapshot before effects run", () => {
  const state = resolveCommunityListDetailsInitialState({
    list: { id: "list-1", name: "Mis favoritas" },
    items: [{ tmdbId: 42, title: "Título" }],
    page: 3,
    hasMore: true,
  });

  assert.equal(state.loading, false);
  assert.equal(state.loadingMore, false);
  assert.equal(state.list?.name, "Mis favoritas");
  assert.deepEqual(state.items.map((item) => item.tmdbId), [42]);
  assert.equal(state.page, 3);
  assert.equal(state.hasMore, true);
});

test("uses the community list id as the cache identity", () => {
  assert.equal(
    getCommunityListDetailsCacheKey("c0ffee"),
    "showverse:list-details:community:c0ffee:v1",
  );
  assert.equal(getCommunityListDetailsCacheKey(null), null);
});

test("keeps a cached personal list visible only while auth is hydrating", () => {
  assert.equal(
    shouldRenderCachedListDuringAuthHydration({
      canUse: false,
      hydrated: false,
      hasCachedData: true,
    }),
    true,
  );
  assert.equal(
    shouldRenderCachedListDuringAuthHydration({
      canUse: false,
      hydrated: true,
      hasCachedData: true,
    }),
    false,
  );
});
