import assert from "node:assert/strict";
import test from "node:test";

import { sameData } from "./useStableState.js";

test("una lista pedida otra vez con los mismos datos es igual", () => {
  const first = [{ id: 1, title: "A", genre_ids: [1, 2], _addedIndex: 0 }];
  const again = [{ id: 1, title: "A", genre_ids: [1, 2], _addedIndex: 0 }];
  assert.equal(sameData(first, again), true);
});

test("un título añadido, quitado o cambiado no es igual", () => {
  const list = [{ id: 1, user_rating: null }];
  assert.equal(sameData(list, [...list, { id: 2 }]), false);
  assert.equal(sameData(list, []), false);
  assert.equal(sameData(list, [{ id: 1, user_rating: 8 }]), false);
  assert.equal(sameData({ a: 1 }, { a: 1, b: undefined }), false);
});

test("compara Map y Set por contenido", () => {
  assert.equal(sameData(new Map([["movie:1", 7.5]]), new Map([["movie:1", 7.5]])), true);
  assert.equal(sameData(new Map([["movie:1", 7.5]]), new Map([["movie:1", 7.6]])), false);
  assert.equal(sameData(new Set([1, 2]), new Set([2, 1])), true);
  assert.equal(sameData(new Set([1]), new Set([2])), false);
});

test("otras instancias solo son iguales a sí mismas", () => {
  const date = new Date(0);
  assert.equal(sameData(date, date), true);
  assert.equal(sameData(new Date(0), new Date(0)), false);
  assert.equal(sameData(NaN, NaN), true);
  assert.equal(sameData([], {}), false);
});
