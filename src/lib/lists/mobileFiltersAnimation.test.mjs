import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const listsPage = readFileSync(
  new URL("../../app/lists/page.jsx", import.meta.url),
  "utf8",
);

test("el menú móvil se recorta al animar y libera los desplegables al abrirse", () => {
  assert.match(
    listsPage,
    /initial={{ height: 0, overflow: "hidden" }}/,
  );
  assert.match(
    listsPage,
    /transitionEnd: { overflow: "visible" }/,
  );
  assert.match(listsPage, /exit={{ height: 0, overflow: "hidden" }}/);
  assert.doesNotMatch(listsPage, /space-y-2 overflow-hidden lg:hidden/);
  assert.match(listsPage, /filtersSticky\s*\? "absolute left-0 right-0 top-full"\s*: "relative"/);
});

test("el botón mantiene sincronizado su estado expandido accesible", () => {
  assert.match(listsPage, /aria-expanded={mobileFiltersOpen}/);
  assert.match(listsPage, /aria-controls="lists-mobile-filters"/);
  assert.match(listsPage, /id="lists-mobile-filters"/);
});
