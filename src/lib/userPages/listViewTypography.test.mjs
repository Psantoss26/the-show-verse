import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const listBranches = [
  {
    name: "Favoritos",
    source: new URL("../../app/favorites/FavoritesClient.jsx", import.meta.url),
    start: 'if (viewMode === "list")',
    end: 'if (viewMode === "compact")',
    metadataPattern:
      /text-xs font-medium leading-tight tracking-\[0\.08em\] text-zinc-400 tabular-nums/,
  },
  {
    name: "Pendientes",
    source: new URL("../../app/watchlist/WatchlistClient.jsx", import.meta.url),
    start: 'if (viewMode === "list")',
    end: 'if (viewMode === "compact")',
    metadataPattern:
      /text-xs font-medium leading-tight tracking-\[0\.08em\] text-zinc-400 tabular-nums/,
  },
  {
    name: "Historial",
    source: new URL("../../app/history/HistoryClient.jsx", import.meta.url),
    start: "const HistoryItemCard = memo",
    end: "const HistoryCompactCard = memo",
    metadataPattern: /text-xs font-semibold leading-tight text-zinc-300/,
  },
];

function extractBranch(source, { start, end, name }) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  assert.ok(
    startIndex >= 0 && endIndex > startIndex,
    `No se encontró la vista lista de ${name}`,
  );
  return source.slice(startIndex, endIndex);
}

test("las vistas lista comparten la jerarquía tipográfica de En progreso", async () => {
  for (const config of listBranches) {
    const source = await readFile(config.source, "utf8");
    const branch = extractBranch(source, config);

    assert.match(
      branch,
      /text-white font-bold text-base leading-tight truncate/,
      `${config.name} debe mantener el título principal legible`,
    );
    assert.match(
      branch,
      config.metadataPattern,
      `${config.name} debe mostrar metadatos con el mismo peso visual`,
    );
    assert.match(
      branch,
      /flex-1 min-w-0 flex flex-col justify-center gap-1\.5/,
      `${config.name} debe usar el mismo ritmo vertical`,
    );
  }
});
