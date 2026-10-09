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
  // El revelado con scroll del teléfono es el de la cabecera compartida
  // (details/MobileDetailsHero): se escribe en el DOM en el mismo evento de
  // scroll, sin esperar a rAF ni a un render de React.
  assert.match(source, /useMobileDetailsHero\(true, \{ lock: mobileHeroCoverReady \}\)/);
  assert.match(source, /\{\.\.\.heroRevealProps\}/);
  assert.match(source, /ref=\{heroScoreboardRef\}/);
  assert.match(source, /window\.addEventListener\("scroll", syncActions, \{ passive: true \}\)/);
  assert.doesNotMatch(source, /window\.requestAnimationFrame\(\(\) => \{\s*frame = 0;\s*syncActions\(\);/);
  const hero = await readFile(new URL("./details/MobileDetailsHero.jsx", import.meta.url), "utf8");
  assert.match(hero, /trigger\.getBoundingClientRect\(\)\.top <= window\.innerHeight - MOBILE_BOTTOM_NAV_PX/);
  assert.match(hero, /window\.addEventListener\('scroll', sync, \{ passive: true \}\)/);
  assert.match(hero, /el\.setAttribute\(MOBILE_REVEAL_ATTR, value\)/);
  assert.doesNotMatch(source, /max-sm:delay-\[70ms\]/);
  assert.match(source, /function DetailsHeroTitle\(\{ children \}\)/);
  assert.match(source, /const nextIsCompact = availableWidth > 0 && naturalWidth > availableWidth/);
  assert.match(source, /text-\[2\.125rem\] md:text-\[2\.75rem\] lg:text-\[3\.35rem\]/);
});
