import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../../components/trakt/TraktWatchedModal.jsx", import.meta.url),
  "utf8",
);

test("el selector de fecha comparte la superficie liquid glass de DetailsClient", () => {
  assert.match(
    source,
    /import LiquidGlassOpticalLayers from "@\/components\/ui\/LiquidGlassOpticalLayers"/,
  );
  assert.match(
    source,
    /<LiquidGlassOpticalLayers \/>/,
    "el modal debe incluir las capas ópticas del cristal",
  );
  assert.match(
    source,
    /relative isolate w-full max-w-sm overflow-hidden rounded-\[2rem\]/,
    "el contenedor debe aislar y recortar el acabado liquid glass",
  );
  assert.match(
    source,
    /mx-5 mb-5 rounded-3xl bg-black\/\[0\.12\] bg-gradient-to-b/,
    "la rejilla debe vivir en el mismo tipo de recuadro de cristal sin borde",
  );
  assert.doesNotMatch(
    source,
    /CalendarPickerModal[\s\S]*?border border-white/,
    "el calendario no debe recuperar contornos neutros en sus recuadros",
  );
});
