import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const historyPage = readFileSync(
  new URL("../../app/history/HistoryClient.jsx", import.meta.url),
  "utf8",
);
const continueWatchingPage = readFileSync(
  new URL("../../app/continue-watching/ContinueWatchingClient.jsx", import.meta.url),
  "utf8",
);
const mobileMenu = continueWatchingPage.slice(
  continueWatchingPage.indexOf('id="continue-watching-mobile-filters"'),
  continueWatchingPage.indexOf("{/* Escritorio: Fila única */}"),
);

const sharedMobileMenuPatterns = [
  /initial={{ height: 0 }}/,
  /animate={{ height: "auto" }}/,
  /exit={{ height: 0 }}/,
  /transition={{ duration: 0\.28, ease: \[0\.16, 1, 0\.3, 1\] }}/,
  /filtersSticky\s*\? "absolute left-0 right-0 top-full"\s*: "relative"/,
  /<div className="space-y-2">/,
];

test("Continuar viendo conserva el mismo menú móvil integrado que Historial", () => {
  for (const pattern of sharedMobileMenuPatterns) {
    assert.match(historyPage, pattern);
    assert.match(continueWatchingPage, pattern);
  }

  assert.doesNotMatch(
    continueWatchingPage,
    /p-3 rounded-2xl bg-zinc-950\/90 backdrop-blur-2xl/,
  );
});

test("las acciones propias de Continuar viendo siguen disponibles", () => {
  assert.match(continueWatchingPage, /onClick={openAddModal}/);
  assert.match(continueWatchingPage, /onClick={\(\) => setEditMode\(\(v\) => !v\)}/);
  assert.match(continueWatchingPage, /aria-controls="continue-watching-mobile-filters"/);
});

test("el menú móvil distribuye ordenar y acciones antes de tipo y las vistas", () => {
  const type = mobileMenu.indexOf('label="Tipo"');
  const add = mobileMenu.indexOf("onClick={openAddModal}");
  const remove = mobileMenu.indexOf("setEditMode((v) => !v)");
  const sort = mobileMenu.indexOf('label="Ordenar"');
  const views = mobileMenu.indexOf('setViewMode("cards")');

  assert.ok(sort >= 0 && sort < add);
  assert.ok(add < remove);
  assert.ok(remove < type);
  assert.ok(type < views);
  assert.match(
    mobileMenu,
    /inline-flex h-11 shrink-0 items-center gap-1 rounded-2xl p-1/,
  );
});
