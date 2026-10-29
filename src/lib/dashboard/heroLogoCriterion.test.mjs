import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

// El logo de cabecera se elige igual en la ficha, la ficha rápida y el
// destacado del dashboard: elección propia -> más votado -> automático con el
// orden común de idiomas.
test("ficha, ficha rápida y destacado usan el mismo orden de idiomas del logo", () => {
  assert.match(read("lib/dashboard/media.js"), /export const HERO_LOGO_LANGS = Object\.freeze\(\["en", null, "es"\]\)/);
  for (const file of [
    "components/FeaturedHero.jsx",
    "components/dashboard/useDetailModalData.js",
    "components/DetailsClient.jsx",
  ]) {
    const source = read(file);
    assert.match(source, /HERO_LOGO_LANGS/, file);
    assert.doesNotMatch(source, /fetchBestLogo\([^)]*\["en", "es", null\]/, file);
  }
});

test("el destacado antepone el logo propio y el más votado, y escucha los votos", () => {
  const hero = read("components/FeaturedHero.jsx");
  assert.match(hero, /useOwnArtwork\(activeMediaType, activeMovie\?\.id, "logo"\)/);
  assert.match(hero, /ownLogo \|\| activeAssets\.communityLogo \|\| activeAssets\.logo/);
  assert.match(hero, /subscribeCommunityArtwork\(/);
  assert.match(hero, /logoPath=\{activeLogoPath\}/);
});
