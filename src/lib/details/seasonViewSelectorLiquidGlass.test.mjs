import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("el selector de vistas de temporada usa el cristal de las secciones sin bordes", async () => {
  const source = await readFile(
    new URL("../../components/SeasonDetailsClient.jsx", import.meta.url),
    "utf8",
  );
  const selector = source.slice(
    source.indexOf('aria-label="Modo de vista de episodios"'),
    source.indexOf("{episodes.length === 0", source.indexOf('aria-label="Modo de vista de episodios"')),
  );

  assert.match(source, /LIQUID_GLASS_BAR, LIQUID_GLASS_CARD/);
  assert.match(selector, /LIQUID_GLASS_BAR/);
  assert.match(selector, /<LiquidGlassOpticalLayers \/>/);
  assert.doesNotMatch(selector, /\bborder(?:-|["\s])/);
  assert.match(selector, /focus-visible:outline/);
});
