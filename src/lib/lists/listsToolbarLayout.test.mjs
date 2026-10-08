import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const listsPage = readFileSync(
  new URL("../../app/lists/page.jsx", import.meta.url),
  "utf8",
);

test("sincronizar se muestra como acción liquid glass junto al título", () => {
  const header = listsPage.slice(
    listsPage.indexOf("{/* Header */}"),
    listsPage.indexOf("{/* Filtros Sticky */}"),
  );

  assert.match(header, /<LiquidButton[\s\S]*?onClick={handleRefresh}/);
  assert.match(header, /title="Sincronizar listas"/);
  assert.equal(
    (listsPage.match(/onClick={handleRefresh}/g) || []).length,
    1,
  );
});

test("en móvil Ordenar y los modos de vista comparten la fila por mitades", () => {
  const mobileFilters = listsPage.slice(
    listsPage.indexOf("{/* Mobile: collapsible filters */}"),
    listsPage.indexOf("{/* Desktop */}"),
  );

  assert.match(
    mobileFilters,
    /data-lists-mobile-order-view="true"[\s\S]*?<InlineDropdown[\s\S]*?label="Ordenar"[\s\S]*?data-lists-view-selector="true"/,
  );
  assert.match(
    mobileFilters,
    /data-lists-mobile-order-view="true"[^>]*className="flex gap-2"/,
  );
  const viewSelector = mobileFilters.slice(
    mobileFilters.indexOf('data-lists-view-selector="true"'),
    mobileFilters.indexOf("</div>", mobileFilters.indexOf('data-lists-view-selector="true"')),
  );
  assert.match(viewSelector, /aria-label="Crear lista"[\s\S]*?<Plus/);
  // Las listas solo se borran desde su ficha: aquí no hay modo borrar.
  assert.doesNotMatch(viewSelector, /Borrar listas|mobileDeleteMode/);
  assert.doesNotMatch(mobileFilters, />Crear<\/span>/);
});

test("las tarjetas del índice no permiten borrar listas (solo desde su ficha)", () => {
  assert.doesNotMatch(listsPage, /Borrar lista|mobileDeleteMode|onDelete|<Trash2/);
  assert.doesNotMatch(listsPage, /\bdel\(/);
});

test("Comunidad no expone los modos Trending o Popular", () => {
  assert.doesNotMatch(listsPage, /label="Modo"/);
  assert.doesNotMatch(listsPage, /setTraktMode/);
  assert.doesNotMatch(listsPage, /VALID_TRAKT_MODES/);
  assert.match(listsPage, /useTraktLists\({ mode: "popular" }\)/);
});
