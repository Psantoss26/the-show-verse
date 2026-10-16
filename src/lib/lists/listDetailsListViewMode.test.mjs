import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const listDetailsTools = readFileSync(
  new URL("../../components/lists/ListDetailsTools.jsx", import.meta.url),
  "utf8",
);
const sectionSheetRows = readFileSync(
  new URL("../../components/details/sectionSheet/SectionSheetRows.jsx", import.meta.url),
  "utf8",
);
const listDetailsPage = readFileSync(
  new URL("../../app/lists/[listId]/page.jsx", import.meta.url),
  "utf8",
);

test("la vista de lista de detalles de listas usa el diseño y componente TitleRow de recomendaciones", () => {
  // Debe importar TitleRow de la vista lateral de secciones
  assert.match(
    listDetailsTools,
    /import\s*\{\s*TitleRow\s*\}\s*from\s*["']@\/components\/details\/sectionSheet\/SectionSheetRows["']/,
  );

  // La rama de viewMode === "list" debe renderizar <ul className="space-y-2"> y <TitleRow />
  const startIndex = listDetailsTools.indexOf('viewMode === "list"');
  const endIndex = listDetailsTools.indexOf('viewMode === "compact"', startIndex);
  assert.ok(startIndex >= 0 && endIndex > startIndex);
  const listModeBranch = listDetailsTools.slice(startIndex, endIndex);

  assert.match(listModeBranch, /<ul className="space-y-2">/);
  assert.match(listModeBranch, /<TitleRow\b/);
  assert.match(listModeBranch, /item=\{entry\.item\}/);
  assert.match(listModeBranch, /mediaType=\{entry\.meta\.mediaType\}/);
  assert.match(listModeBranch, /posterPath=\{entry\.meta\.posterPath\}/);
  assert.match(listModeBranch, /posterLoading=\{entry\.meta\.posterLoading\}/);
  assert.match(listModeBranch, /showImdb=\{/);
  assert.match(listModeBranch, /imdbRating=\{entry\.meta\.imdbRating\}/);
  assert.match(listModeBranch, /action=\{action\}/);
});

test("TitleRow en SectionSheetRows incluye soporte para acciones, carga de póster y enlace personalizado", () => {
  assert.match(sectionSheetRows, /export function TitleRow\(/);
  assert.match(sectionSheetRows, /action = null/);
  assert.match(sectionSheetRows, /posterLoading = false/);
  assert.match(sectionSheetRows, /onPosterError = null/);
  assert.match(sectionSheetRows, /ROW_LINK_LARGE/);
  assert.match(sectionSheetRows, /LARGE_POSTER/);
});

test("la página de detalle de listas de usuario proporciona renderAction para borrado en modo lista", () => {
  assert.match(listDetailsPage, /renderAction=\{\(it, meta, editMode\) =>/);
  assert.match(listDetailsPage, /handleRemove\(it\)/);
});
