import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("./PosterStack.jsx", import.meta.url);

test("las cinco portadas de cada lista no dibujan contornos marcados", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.doesNotMatch(source, /rounded-xl border bg-zinc-900/);
  assert.doesNotMatch(source, /border-white\/(?:10|40)/);
  assert.doesNotMatch(source, /ring-1 ring-white\/50/);
  assert.doesNotMatch(source, /to-white\/10/);
});

test("las portadas conservan forma, profundidad y respuesta al hover", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /overflow-hidden rounded-xl bg-zinc-900 shadow-2xl/);
  assert.match(source, /scale-110/);
  assert.match(source, /shadow-\[0_0_30px_rgba\(99,102,241,0\.5\)\]/);
  assert.match(source, /brightness-\[0\.4\] blur-\[0\.5px\]/);
});
