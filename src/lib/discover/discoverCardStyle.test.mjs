import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../../components/DiscoverClient.jsx", import.meta.url);

async function discoverCardSource() {
  const source = await readFile(sourceUrl, "utf8");
  const start = source.indexOf("function DiscoverHoverIndicator");
  const end = source.indexOf("function ProviderIcon", start);
  assert.ok(start >= 0 && end > start, "No se encontró la tarjeta de Descubrir");
  return source.slice(start, end);
}

test("las tarjetas de Descubrir usan el indicador liquid glass de Pendientes sin borde de hover", async () => {
  const source = await discoverCardSource();

  assert.match(source, /LIQUID_GLASS_PANEL/);
  assert.match(source, /lg:group-hover:opacity-100/);
  assert.doesNotMatch(source, /hover:after:shadow/);
  assert.doesNotMatch(source, /top-0 left-0 z-20/);
  assert.doesNotMatch(source, /bg-gradient-to-t from-black\/95/);
  assert.doesNotMatch(source, /year \|\| "N\/A"/);
  assert.match(source, /rounded-xl bg-zinc-900 shadow-md/);
  assert.match(source, /imdbScore/);
  assert.match(source, /text-amber-300/);
});

test("Descubrir no cubre los resultados con un estado de actualización", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.doesNotMatch(source, /Actualizando/);
  assert.doesNotMatch(source, /opacity-50 pointer-events-none/);
});

test("Descubrir solicita IMDb solo al interactuar con una tarjeta", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /fetch\("\/api\/imdb\/ratings"/);
  assert.match(source, /priority: "low"/);
  assert.match(source, /void fetchDiscoverImdbScore\(item\)\.then\(setImdbScore\)/);
});
