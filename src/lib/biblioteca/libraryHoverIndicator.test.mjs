import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../../app/biblioteca/BibliotecaClient.jsx", import.meta.url);

async function libraryCardSource() {
  const source = await readFile(sourceUrl, "utf8");
  const start = source.indexOf("function LibraryHoverIndicator");
  const end = source.indexOf("// ================== MAIN COMPONENT", start);
  assert.ok(start >= 0 && end > start, "No se encontró la tarjeta de Biblioteca");
  return source.slice(start, end);
}

test("Biblioteca muestra tipo y resolución en un indicador hover liquid glass", async () => {
  const source = await libraryCardSource();

  assert.match(source, /LIQUID_GLASS_PANEL/);
  assert.match(source, /formatResolutionLabel\(resolution\)/);
  assert.match(source, /isMovie \? "text-sky-400" : "text-violet-400"/);
  assert.match(source, /<LibraryHoverIndicator[\s\S]*resolution=\{primaryRes\}/);
  assert.match(source, /lg:group-hover:opacity-100/);
  assert.match(source, /compact \? "bottom-1\.5 px-1" : "bottom-2 px-1\.5"/);
  assert.match(
    source,
    /compact\s*\? "h-7 w-8 text-base"\s*:\s*"h-9 w-10 text-xl"/,
  );
  assert.match(source, /const hasLongResolutionLabel = resolutionLabel\?\.length > 2/);
  assert.match(source, /\? "h-7 px-2 text-base"/);
  assert.match(source, /: "h-9 px-2\.5 text-xl"/);
  assert.match(source, /hasLongResolutionLabel \? "gap-0\.5" : ""/);
  assert.match(source, /hover:after:shadow-\[inset_0_0_0_2\.5px_rgba\(239,68,68,0\.95\)\]/);
  assert.match(source, /lg:hover:shadow-red-900\/20/);
  assert.match(source, /group-hover:shadow-\[inset_0_0_0_2\.5px_rgba\(239,68,68,0\.95\)\]/);
  assert.match(source, /zIndex: 100/);
  assert.doesNotMatch(source, /bg-gradient-to-t from-black\/90/);
});
