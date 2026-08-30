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
  assert.match(source, /const syncVisibility = \(\) => \{/);
  assert.match(source, /trigger\.getBoundingClientRect\(\)\.top/);
  assert.match(source, /window\.addEventListener\("scroll", syncVisibility, \{ passive: true \}\)/);
  assert.doesNotMatch(source, /window\.requestAnimationFrame\(\(\) => \{\s*frame = 0;\s*syncVisibility\(\);/);
  assert.match(source, /const MOBILE_REVEAL_HIDDEN =\s*"max-sm:invisible max-sm:pointer-events-none"/);
  assert.doesNotMatch(source, /max-sm:delay-\[70ms\]/);
  assert.match(source, /function DetailsHeroTitle\(\{ children \}\)/);
  assert.match(source, /const nextIsCompact = availableWidth > 0 && naturalWidth > availableWidth/);
  assert.match(source, /text-\[2\.125rem\] md:text-\[2\.75rem\] lg:text-\[3\.35rem\]/);
});
