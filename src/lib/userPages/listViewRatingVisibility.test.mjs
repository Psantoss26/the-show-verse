import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSources = [
  new URL("../../app/favorites/FavoritesClient.jsx", import.meta.url),
  new URL("../../app/watchlist/WatchlistClient.jsx", import.meta.url),
];

function listViewSource(source) {
  const start = source.indexOf('if (viewMode === "list")');
  const end = source.indexOf('if (viewMode === "compact")', start);
  assert.ok(start >= 0 && end > start, "No se encontró la rama de vista lista");
  return source.slice(start, end);
}

test("Favoritos y Pendientes no muestran puntuación en la vista de lista", async () => {
  const sources = await Promise.all(
    pageSources.map((source) => readFile(source, "utf8")),
  );

  sources.map(listViewSource).forEach((listSource) => {
    assert.doesNotMatch(listSource, /<Star\b/);
    assert.doesNotMatch(listSource, /\{rating\}/);
    assert.match(listSource, /\{year && <span>\{year\}<\/span>\}/);
  });
});
