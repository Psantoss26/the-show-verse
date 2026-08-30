import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("./DetailsClient.jsx", import.meta.url);

test("DetailsClient enables profile title navigation only for the mobile hero", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /getUserDetailsSequence\(currentDetailsHref\)/);
  assert.match(source, /onSwipeLeft: \(\) => navigateUserDetailsSequence\("next"\)/);
  assert.match(source, /onSwipeRight: \(\) => navigateUserDetailsSequence\("previous"\)/);
  assert.match(source, /ref=\{posterWrapRef\}[\s\S]*?\{\.\.\.userDetailsSwipeHandlers\}/);
  assert.match(source, /ref=\{mobileActionRowRef\}[\s\S]*?\{\.\.\.userDetailsSwipeHandlers\}/);
});
