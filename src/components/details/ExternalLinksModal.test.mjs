import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("./ExternalLinksModal.jsx", import.meta.url);

test("el modal de plataformas monta el cristal con la transición inicial común", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /if \(!open\) return null/);
  assert.match(source, /backdrop-blur-lg animate-in fade-in duration-300/);
  assert.match(
    source,
    /\$\{LIQUID_GLASS_PANEL\} animate-in zoom-in-95 duration-300 ease-out/,
  );
  assert.doesNotMatch(source, /AnimatePresence|motion\./);
});
