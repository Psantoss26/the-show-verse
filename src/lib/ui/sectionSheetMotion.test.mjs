import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  SHEET_ENTER,
  SHEET_EXIT,
  SHEET_PANEL_FRAMES,
} from "./sectionSheetMotion.js";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("en el teléfono el panel ocupa siempre la pantalla completa", () => {
  const sheet = read("components/details/sectionSheet/SectionSheet.jsx");
  assert.match(sheet, /className=\{`fixed inset-0 z-\[10000\]/);
  assert.doesNotMatch(sheet, /data-sv-sheet-anchor|anchorTop|window\.scrollBy/);
  assert.doesNotMatch(read("components/DetailsClient.jsx"), /data-sv-sheet-(anchor|keep)/);
  assert.doesNotMatch(read("components/Navbar.jsx"), /data-sv-sheet-keep/);
  assert.doesNotMatch(read("app/globals.css"), /data-sv-sheet-(anchored|keep)/);
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

test("el menú de secciones marca la sección del panel abierto y cambia de panel", () => {
  const details = read("components/DetailsClient.jsx");
  assert.match(details, /onChange=\{onSectionMenuChange\}/);
  assert.match(details, /activeId=\{sheetId \|\| activeId\}/);
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
