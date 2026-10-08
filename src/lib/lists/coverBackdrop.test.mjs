import assert from "node:assert/strict";
import test from "node:test";

import { pickCollectionCoverBackdrop, posterShelfLayout } from "./coverBackdrop.js";

const backdrop = (file_path, iso_639_1, width = 1920, height = 1080) => ({ file_path, iso_639_1, width, height });

test("backdrop de colección: solo con idioma, inglés antes que español", () => {
  assert.equal(
    pickCollectionCoverBackdrop([backdrop("/null.jpg", null), backdrop("/es.jpg", "es"), backdrop("/en.jpg", "en")]),
    "/en.jpg",
  );
  assert.equal(pickCollectionCoverBackdrop([backdrop("/null.jpg", null), backdrop("/es.jpg", "es")]), "/es.jpg");
  // Sin ninguno con idioma, el modo no está disponible.
  assert.equal(pickCollectionCoverBackdrop([backdrop("/null.jpg", null)]), null);
  assert.equal(pickCollectionCoverBackdrop(undefined), null);
});

function inside(tile) {
  return tile.left >= 0 && tile.top >= 0 && tile.left + tile.width <= 100.0001 && tile.top + tile.height <= 100.0001;
}

test("estantería: todo dentro de la caja, sin solapes y en 2:3", () => {
  for (let count = 1; count <= 20; count += 1) {
    const { tiles } = posterShelfLayout(count);
    assert.equal(tiles.length, count, `count ${count}`);
    for (const tile of tiles) {
      assert.ok(inside(tile), `count ${count} fuera de la caja`);
      // 2:3 en px: ancho% · 100 / (alto% · 56.25) = 2/3.
      const ratio = (tile.width * 100) / (tile.height * 56.25);
      assert.ok(Math.abs(ratio - 2 / 3) < 1e-6);
    }
    for (let a = 0; a < tiles.length; a += 1) {
      for (let b = a + 1; b < tiles.length; b += 1) {
        const A = tiles[a];
        const B = tiles[b];
        const overlap =
          A.left < B.left + B.width - 1e-6 &&
          B.left < A.left + A.width - 1e-6 &&
          A.top < B.top + B.height - 1e-6 &&
          B.top < A.top + A.height - 1e-6;
        assert.equal(overlap, false, `count ${count}: ${a} y ${b} se solapan`);
      }
    }
  }
});

test("estantería: elige filas para que los pósters salgan grandes y reparte igualado", () => {
  assert.equal(posterShelfLayout(1).rows, 1);
  assert.equal(posterShelfLayout(3).rows, 1);
  const twenty = posterShelfLayout(20);
  assert.equal(twenty.rows, 3);
  // 20 → 7 · 7 · 6 (filas por su `top`).
  const perRow = Object.values(
    twenty.tiles.reduce((acc, tile) => ({ ...acc, [tile.top.toFixed(3)]: (acc[tile.top.toFixed(3)] || 0) + 1 }), {}),
  );
  assert.deepEqual(perRow, [7, 7, 6]);
  assert.deepEqual(posterShelfLayout(0).tiles, []);
});
