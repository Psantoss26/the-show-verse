import assert from "node:assert/strict";
import test from "node:test";

import { hasCollectionLikes, mergeCollectionLikes, readCollectionLikes } from "./collectionLikesCache.js";

test("las colecciones solo están listas cuando se conocen TODOS sus likes", () => {
  assert.equal(hasCollectionLikes({}, []), true);
  assert.equal(hasCollectionLikes({ 10: 3, 656: 0 }, [10, 656]), true);
  // Un 0 conocido cuenta como conocido; una ausente, no.
  assert.equal(hasCollectionLikes({ 10: 3 }, [10, 656]), false);
});

test("los recuentos nuevos se suman a los conocidos", () => {
  mergeCollectionLikes({ 10: 2, 656: 1 });
  mergeCollectionLikes({ 10: "4" });
  assert.deepEqual(readCollectionLikes(), { 10: 4, 656: 1 });
  // Lo leído es una copia: modificarla no altera la caché.
  readCollectionLikes()[10] = 99;
  assert.equal(readCollectionLikes()[10], 4);
});
