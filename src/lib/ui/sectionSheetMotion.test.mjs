import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  SHEET_ENTER,
  SHEET_EXIT,
  SHEET_PANEL_FRAMES,
  sheetAnchorPlacement,
} from "./sectionSheetMotion.js";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("el panel empieza bajo un menú ya pegado sin desplazar la página", () => {
  assert.deepEqual(sheetAnchorPlacement({ top: 64, bottom: 120 }, 64, 800), { scrollBy: 0, top: 120 });
});

test("si el menú aún no está pegado, se sube la página lo justo", () => {
  assert.deepEqual(sheetAnchorPlacement({ top: 600, bottom: 656 }, 64, 800), { scrollBy: 536, top: 120 });
});

test("sin menú medible o sin sitio útil, pantalla completa", () => {
  assert.equal(sheetAnchorPlacement(null, 64, 800), null);
  assert.equal(sheetAnchorPlacement({ top: 0, bottom: 0 }, 64, 800), null);
  assert.equal(sheetAnchorPlacement({ top: 300, bottom: 600 }, 300, 800), null);
});

test("entrada y salida: una sola definición, solo transform en el panel", () => {
  assert.ok(SHEET_ENTER.duration > SHEET_EXIT.duration);
  for (const frame of SHEET_PANEL_FRAMES) assert.deepEqual(Object.keys(frame), ["transform"]);
  const sheet = read("components/details/sectionSheet/SectionSheet.jsx");
  assert.match(sheet, /SHEET_ENTER/);
  assert.match(sheet, /SHEET_EXIT/);
  // Ya no hay animación CSS propia que pueda divergir de la de WAAPI.
  assert.doesNotMatch(read("app/globals.css"), /sv-sheet-in/);
  assert.doesNotMatch(sheet, /sv-sheet-in/);
});

test("la barra superior, la inferior y el menú de secciones siguen a la vista con el panel abierto", () => {
  const navbar = read("components/Navbar.jsx");
  assert.equal(navbar.match(/data-sv-sheet-keep=""/g)?.length, 2);
  const details = read("components/DetailsClient.jsx");
  assert.match(details, /data-sv-sheet-anchor=""\s+data-sv-sheet-keep=""\s+className="sticky z-30/);
  // El menú marca la sección del panel abierto y cambia de panel.
  assert.match(details, /onChange=\{onSectionMenuChange\}/);
  assert.match(details, /activeId=\{sheetId \|\| activeId\}/);

  const css = read("app/globals.css");
  // Lo marcado con data-sv-sheet-keep no pierde su cristal.
  assert.match(css, /body > :not\(\[data-detail-modal-layer\], \.sv-inline-menu, \[data-sv-sheet-keep\]\)/);
  assert.match(css, /:not\(\[data-sv-sheet-keep\], \[data-sv-sheet-keep\] \*\)/);
  // La barra inferior flota sobre el panel anclado.
  assert.match(css, /:root\[data-sv-sheet-anchored\] \.sv-navbar-bottom-shift \{\s*z-index: 10001;/);

  const sheet = read("components/details/sectionSheet/SectionSheet.jsx");
  assert.match(sheet, /querySelector\("\[data-sv-sheet-anchor\]"\)/);
});

test("los paneles de la ficha y del actor siguen montados mientras salen", () => {
  for (const path of [
    "components/details/sectionSheet/DetailsSectionSheets.jsx",
    "components/details/sectionSheet/ActorSectionSheets.jsx",
  ]) {
    const source = read(path);
    assert.match(source, /useSheetPresence\(/, path);
    assert.match(source, /<SectionSheetPresence\.Provider value=\{presence\}>/, path);
  }
});
