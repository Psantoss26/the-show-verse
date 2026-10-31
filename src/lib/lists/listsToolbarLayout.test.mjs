import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const listsPage = readFileSync(
  new URL("../../app/lists/ListsClient.jsx", import.meta.url),
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

test("en móvil la hoja ordena Ordenar, Vista y la acción de crear", () => {
  const mobileFilters = listsPage.slice(
    listsPage.indexOf("{/* Mobile: hoja de filtros y vista */}"),
    listsPage.indexOf("{/* Desktop */}"),
  );

  const sort = mobileFilters.indexOf('label="Ordenar"');
  const view = mobileFilters.indexOf('label="Vista"');
  const create = mobileFilters.indexOf("Crear lista");
  assert.ok(sort >= 0 && sort < view && view < create);
  assert.match(mobileFilters, /\{canEdit && \(\s*<SheetOptionGroup label="Acciones"/);
  // Las listas solo se borran desde su ficha: aquí no hay modo borrar.
  assert.doesNotMatch(mobileFilters, /Borrar listas|mobileDeleteMode/);
});

test("las tarjetas del índice no permiten borrar listas (solo desde su ficha)", () => {
  assert.doesNotMatch(listsPage, /Borrar lista|mobileDeleteMode|onDelete|<Trash2/);
  assert.doesNotMatch(listsPage, /\bdel\(/);
});

test("Comunidad no expone los modos Trending o Popular", () => {
  assert.doesNotMatch(listsPage, /label="Modo"/);
  assert.doesNotMatch(listsPage, /setTraktMode/);
  assert.doesNotMatch(listsPage, /VALID_TRAKT_MODES/);
  // Modo fijo; el orden y la búsqueda los aplica el servidor (paginado).
  assert.match(listsPage, /useTraktLists\(\{\s*mode: "popular",/);
});
