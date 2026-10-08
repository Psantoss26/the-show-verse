import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  collectionPreviewFromIndex,
  communityListPreviewFromIndex,
  findListInIndexCache,
  getCommunityListDetailsCacheKey,
  personalListPreviewFromIndex,
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

test("las tres fichas de lista restauran la caché tras hidratar y antes de pintar", async () => {
  const sources = await Promise.all([
    readFile(new URL("../../components/lists/TraktListDetailsClient.jsx", import.meta.url), "utf8"),
    readFile(new URL("../../components/lists/CollectionDetailsClient.jsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/lists/[listId]/page.jsx", import.meta.url), "utf8"),
  ]);

  for (const source of sources) {
    assert.match(source, /useIsHistoryNavigation\(\)/);
    assert.match(source, /useClientLayoutEffect/);
    assert.match(source, /if \(!isBackNav\) return/);
  }
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

function fakeStorage(entries) {
  const keys = Object.keys(entries)
  return {
    get length() { return keys.length },
    key: (index) => keys[index] ?? null,
    getItem: (key) => (key in entries ? entries[key] : null),
  }
}

test('findListInIndexCache busca la lista en cualquier ámbito de su fuente', () => {
  const now = 1_000_000
  const storage = fakeStorage({
    'showverse:lists:index:collections:featured:v1': JSON.stringify({ t: now - 1000, data: [{ id: '10', name: 'Star Wars' }] }),
    'showverse:lists:index:collections:search:saw:v1': JSON.stringify({ t: now - 1000, data: [{ id: '656', name: 'Saw' }] }),
    'showverse:lists:index:trakt:popular:v1': JSON.stringify({ t: now - 1000, data: [{ id: '656', name: 'Otra' }] }),
    'otra:clave': 'no-json',
  })
  assert.equal(findListInIndexCache('collections', 656, { storage, now })?.name, 'Saw')
  assert.equal(findListInIndexCache('trakt', '656', { storage, now })?.name, 'Otra')
  assert.equal(findListInIndexCache('personal', '656', { storage, now }), null)
  assert.equal(findListInIndexCache('collections', '999', { storage, now }), null)
})

test('findListInIndexCache ignora cachés caducadas o corruptas', () => {
  const now = 10_000_000
  const storage = fakeStorage({
    'showverse:lists:index:trakt:popular:v1': JSON.stringify({ t: now - 21 * 60 * 1000, data: [{ id: 'a' }] }),
    'showverse:lists:index:trakt:otro:v1': '{roto',
  })
  assert.equal(findListInIndexCache('trakt', 'a', { storage, now }), null)
  assert.equal(findListInIndexCache('trakt', 'a', { storage: null, now }), null)
})

test('vistas provisionales: colección con su sufijo, lista propia editable', () => {
  assert.deepEqual(
    collectionPreviewFromIndex({ id: 10, name: 'La guerra de las galaxias', item_count: 9, poster_path: '/p.jpg' }),
    {
      id: '10',
      name: 'La guerra de las galaxias - Colección',
      description: '',
      item_count: 9,
      poster_path: '/p.jpg',
      backdrop_path: null,
      cast: [],
      revenue: 0,
    },
  )
  assert.equal(collectionPreviewFromIndex(null), null)
  assert.equal(communityListPreviewFromIndex({ id: 'x', name: 'L', likes: '3' }).likes, 3)
  const personal = personalListPreviewFromIndex({ id: 'p1', name: 'Mía', item_count: 4, public: 1 })
  assert.equal(personal.canEdit, true)
  assert.equal(personal.public, true)
  assert.deepEqual(personal.items, [])
})
