import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("./DetailsClient.jsx", import.meta.url);

test("DetailsClient waits for client readiness before starting entry animations", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /data-details-entry=\{detailsEntryReady \? "ready" : "loading"\}/);
  assert.match(source, /setDetailsEntry\(\{ key: detailsEntryKey, ready: true \}\)/);
  assert.match(source, /detailsEntryReady \? "sv-details-entry" : ""/);
  assert.match(source, /detailsEntryReady && currentLowLoaded/);
  assert.match(source, /detailsEntryReady && currentLowLoaded && inProgressChecked/);
});
