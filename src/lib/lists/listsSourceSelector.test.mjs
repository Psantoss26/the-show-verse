import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const listsPage = readFileSync(
  new URL("../../app/lists/page.jsx", import.meta.url),
  "utf8",
);

test("las tres fuentes se muestran en un selector segmentado con iconos", () => {
  assert.match(listsPage, /function ListsSourceSelector/);
  assert.match(listsPage, /label: "Mis listas"[\s\S]*?Icon: ListVideo/);
  assert.match(listsPage, /label: "Comunidad"[\s\S]*?Icon: Users/);
  assert.match(listsPage, /label: "Colecciones"[\s\S]*?Icon: Layers/);
  assert.match(listsPage, /aria-pressed={active}/);
  assert.match(
    listsPage,
    /active && \([\s\S]*?<span className="hidden[^"]*lg:inline[^"]*">\s*{label}\s*<\/span>/,
  );
});

test("el selector de fuente está junto al buscador y ya no existe el filtro FUENTE", () => {
  const mobileToolbar = listsPage.slice(
    listsPage.indexOf("{/* Mobile: search + toggle */}"),
    listsPage.indexOf("{/* Mobile: collapsible filters */}"),
  );
  const desktopToolbar = listsPage.slice(
    listsPage.indexOf("{/* Desktop */}"),
    listsPage.indexOf("<AnimatePresence>", listsPage.indexOf("{/* Desktop */}")),
  );

  assert.match(mobileToolbar, /<ListsSourceSelector/);
  assert.match(desktopToolbar, /<ListsSourceSelector/);
  assert.ok(
    mobileToolbar.indexOf("<ListsSourceSelector") <
      mobileToolbar.indexOf("<Search"),
  );
  assert.ok(
    desktopToolbar.indexOf("<ListsSourceSelector") <
      desktopToolbar.indexOf("<Search"),
  );
  assert.doesNotMatch(listsPage, /label="Fuente"/);
});
