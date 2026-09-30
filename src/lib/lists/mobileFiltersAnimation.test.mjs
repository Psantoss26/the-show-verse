import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const listsPage = readFileSync(
  new URL("../../app/lists/page.jsx", import.meta.url),
  "utf8",
);

test("el menú móvil usa el panel común, que recorta al animar y libera los desplegables al abrirse", () => {
  assert.match(listsPage, /<MobileFiltersPanel\s+open={mobileFiltersOpen}/);
  assert.doesNotMatch(listsPage, /animate={{\s*height: "auto"/);
  assert.doesNotMatch(listsPage, /space-y-2 overflow-hidden lg:hidden/);
  assert.match(listsPage, /filtersSticky \? "absolute left-0 right-0 top-full" : "relative"/);
});

test("el botón mantiene sincronizado su estado expandido accesible", () => {
  assert.match(listsPage, /aria-expanded={mobileFiltersOpen}/);
  assert.match(listsPage, /aria-controls="lists-mobile-filters"/);
  assert.match(listsPage, /id="lists-mobile-filters"/);
});
