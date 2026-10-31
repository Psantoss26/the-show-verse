import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const listsPage = readFileSync(
  new URL("../../app/lists/ListsClient.jsx", import.meta.url),
  "utf8",
);

test("el menú móvil abre la hoja común de filtros y vista", () => {
  assert.match(listsPage, /<MobileOptionsSheet\s+open={mobileFiltersOpen}\s+onClose={\(\) => setMobileFiltersOpen\(false\)}/);
  assert.doesNotMatch(listsPage, /<MobileFiltersPanel\b/);
});

test("el botón anuncia que abre un diálogo y su estado", () => {
  assert.match(listsPage, /aria-haspopup="dialog"/);
  assert.match(listsPage, /aria-expanded={mobileFiltersOpen}/);
  assert.match(listsPage, /id="lists-mobile-filters"/);
});
