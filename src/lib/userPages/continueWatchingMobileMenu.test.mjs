import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const continueWatchingPage = readFileSync(
  new URL("../../app/continue-watching/ContinueWatchingClient.jsx", import.meta.url),
  "utf8",
);
const mobileMenu = continueWatchingPage.slice(
  continueWatchingPage.indexOf("<MobileOptionsSheet"),
  continueWatchingPage.indexOf("</MobileOptionsSheet>"),
);

test("Continuar viendo abre la hoja común de filtros y vista", () => {
  assert.ok(mobileMenu.length > 0);
  assert.match(mobileMenu, /onClose={\(\) => setMobileFiltersOpen\(false\)}/);
  assert.match(mobileMenu, /id="continue-watching-mobile-filters"/);
  assert.doesNotMatch(continueWatchingPage, /<MobileFiltersPanel\b/);
});

test("las acciones propias de Continuar viendo siguen en la hoja y la cierran", () => {
  assert.match(mobileMenu, /openAddModal\(\);/);
  assert.match(mobileMenu, /setEditMode\(\(current\) => \(current === mode \? null : mode\)\)/);
  assert.match(mobileMenu, /Salir del modo edición/);
});

test("la hoja ordena filtros, orden, vista, imagen y acciones", () => {
  const type = mobileMenu.indexOf('label="Tipo"');
  const sort = mobileMenu.indexOf('label="Ordenar"');
  const views = mobileMenu.indexOf('label="Vista"');
  const image = mobileMenu.indexOf("<ImageModeSheetGroup");
  const actions = mobileMenu.indexOf('label="Acciones"');

  assert.ok(type >= 0 && type < sort);
  assert.ok(sort < views);
  assert.ok(views < image);
  assert.ok(image < actions);
});
