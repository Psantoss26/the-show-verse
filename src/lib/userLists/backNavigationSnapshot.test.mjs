import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveUserListInitialSnapshot,
  shouldPreserveAddedOrderSnapshot,
  reconcileAddedOrderSnapshot,
  userListItemKey,
} from "./backNavigationSnapshot.js";

// Ordena por `_addedIndex` como lo hace la vista (added-desc = ascendente).
const byAddedDesc = (items) =>
  [...items]
    .sort((a, b) => (a._addedIndex || 0) - (b._addedIndex || 0))
    .map((i) => i.id);
const byAddedAsc = (items) =>
  [...items]
    .sort((a, b) => (b._addedIndex || 0) - (a._addedIndex || 0))
    .map((i) => i.id);

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

test("does NOT restore even a fresh cache on a normal entry (cross-device safety)", () => {
  // Aunque la caché sea reciente ("fresh"), en una entrada normal no se pinta:
  // podría no reflejar cambios hechos desde otro dispositivo. Se carga fresco.
  assert.deepEqual(
    resolveUserListInitialSnapshot({ fresh: true, items: [{ id: 1 }] }, false),
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

test("keeps added-date ordering frozen only while restoring a back snapshot", () => {
  for (const sortBy of ["added-desc", "added-asc"]) {
    assert.equal(
      shouldPreserveAddedOrderSnapshot({
        hasBackNavigationSnapshot: true,
        sortBy,
      }),
      true,
    );
  }

  for (const sortBy of ["title-asc", "title-desc", "rating-desc"]) {
    assert.equal(
      shouldPreserveAddedOrderSnapshot({
        hasBackNavigationSnapshot: true,
        sortBy,
      }),
      false,
    );
  }

  assert.equal(
    shouldPreserveAddedOrderSnapshot({
      hasBackNavigationSnapshot: false,
      sortBy: "added-desc",
    }),
    false,
  );
});

test("reconcile keeps the same reference when nothing changed", () => {
  const prev = [
    { id: 1, media_type: "movie", _addedIndex: 0 },
    { id: 2, media_type: "tv", _addedIndex: 1 },
  ];
  const fresh = [
    { id: 1, media_type: "movie", _addedIndex: 0 },
    { id: 2, media_type: "tv", _addedIndex: 1 },
  ];
  assert.equal(
    reconcileAddedOrderSnapshot(prev, fresh, userListItemKey),
    prev,
  );
});

test("reconcile surfaces a newly added title at the top for added-desc", () => {
  // Snapshot que dejó el usuario (2 títulos). Se añade uno nuevo desde una
  // ficha → el servidor lo devuelve en la posición 0 y desplaza al resto.
  const prev = [
    { id: 1, media_type: "movie", _addedIndex: 0 },
    { id: 2, media_type: "movie", _addedIndex: 1 },
  ];
  const fresh = [
    { id: 9, media_type: "movie", _addedIndex: 0 }, // nuevo
    { id: 1, media_type: "movie", _addedIndex: 1 },
    { id: 2, media_type: "movie", _addedIndex: 2 },
  ];
  const result = reconcileAddedOrderSnapshot(prev, fresh, userListItemKey);
  // El nuevo aparece (no desaparece) y queda ARRIBA en added-desc, sin
  // reordenar la posición relativa de los que ya estaban (1 antes que 2, tal
  // como en la instantánea).
  assert.deepEqual(byAddedDesc(result), [9, 1, 2]);
  // ...y en added-asc (más antiguo primero) el nuevo queda el ÚLTIMO, y los
  // previos conservan su orden relativo invertido (2 es más antiguo que 1).
  assert.deepEqual(byAddedAsc(result), [2, 1, 9]);
});

test("reconcile drops a title removed from the server", () => {
  const prev = [
    { id: 1, media_type: "movie", _addedIndex: 0 },
    { id: 2, media_type: "movie", _addedIndex: 1 },
    { id: 3, media_type: "movie", _addedIndex: 2 },
  ];
  const fresh = [
    { id: 1, media_type: "movie", _addedIndex: 0 },
    { id: 3, media_type: "movie", _addedIndex: 1 }, // el 2 se quitó
  ];
  const result = reconcileAddedOrderSnapshot(prev, fresh, userListItemKey);
  assert.deepEqual(byAddedDesc(result), [1, 3]);
});

test("reconcile preserves the relative order of multiple new titles", () => {
  const prev = [{ id: 1, media_type: "movie", _addedIndex: 0 }];
  const fresh = [
    { id: 8, media_type: "movie", _addedIndex: 0 }, // el más reciente
    { id: 7, media_type: "movie", _addedIndex: 1 },
    { id: 1, media_type: "movie", _addedIndex: 2 },
  ];
  const result = reconcileAddedOrderSnapshot(prev, fresh, userListItemKey);
  assert.deepEqual(byAddedDesc(result), [8, 7, 1]);
});

test("reconcile does not confuse a movie and a tv show with the same id", () => {
  const prev = [{ id: 5, media_type: "movie", _addedIndex: 0 }];
  const fresh = [
    { id: 5, media_type: "tv", _addedIndex: 0 }, // serie nueva, mismo id
    { id: 5, media_type: "movie", _addedIndex: 1 },
  ];
  const result = reconcileAddedOrderSnapshot(prev, fresh, userListItemKey);
  assert.equal(result.length, 2);
  assert.deepEqual(byAddedDesc(result).length, 2);
  const tv = result.find((i) => i.media_type === "tv");
  const movie = result.find((i) => i.media_type === "movie");
  assert.ok(tv && movie);
  assert.ok(tv._addedIndex < movie._addedIndex); // la serie nueva, arriba
});
