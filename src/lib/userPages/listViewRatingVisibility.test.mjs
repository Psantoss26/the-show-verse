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

test("Favoritos y Pendientes usan en la vista de lista la fila de listas con backdrop", async () => {
  const sources = await Promise.all(
    pageSources.map((source) => readFile(source, "utf8")),
  );

  sources.map(listViewSource).forEach((listSource) => {
    // La misma fila que listas y colecciones (TitleRow): año, duración,
    // géneros y notas de TMDb e IMDb, con el backdrop en lugar del póster.
    assert.match(listSource, /<TitleRow\b/);
    assert.match(listSource, /showTitleMeta/);
    assert.match(listSource, /imdbRating=\{imdbScore\}/);
    assert.match(listSource, /media=\{\s*<SmartPoster[^>]*mode=\{effectiveImageMode\}/);
  });
});
