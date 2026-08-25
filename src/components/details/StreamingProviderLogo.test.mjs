import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const logoUrl = new URL("./StreamingProviderLogo.jsx", import.meta.url);
const detailsUrl = new URL("../DetailsClient.jsx", import.meta.url);
const modalUrl = new URL("../dashboard/DetailModal.jsx", import.meta.url);

test("las plataformas de la ficha y del modal usan una celda visual única", async () => {
  const [logo, details, modal] = await Promise.all([
    readFile(logoUrl, "utf8"),
    readFile(detailsUrl, "utf8"),
    readFile(modalUrl, "utf8"),
  ]);

  assert.match(logo, /h-11 w-11 shrink-0 overflow-visible rounded-xl/);
  assert.match(logo, /h-full w-full rounded-xl object-cover/);
  assert.match(logo, /absolute -right-1 -top-1 h-3 w-3/);
  assert.match(details, /StreamingProviderLogo\s+provider=\{provider\}/);
  assert.match(modal, /StreamingProviderLogo provider=\{prov\}/);
});
