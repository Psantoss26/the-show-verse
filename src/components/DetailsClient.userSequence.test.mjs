import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("./DetailsClient.jsx", import.meta.url);

test("DetailsClient delegates profile title navigation to the global mobile navigator", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.doesNotMatch(source, /useHorizontalSwipe/);
  assert.doesNotMatch(source, /userDetailsSwipeHandlers/);
  assert.match(source, /<div\s+data-details-root/);
});
