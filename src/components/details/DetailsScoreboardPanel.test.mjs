import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("./DetailsScoreboardPanel.jsx", import.meta.url);

test("el botón etiquetado de enlaces alinea icono y texto en una sola fila", async () => {
  const source = await readFile(sourceUrl, "utf8");

  // Sin `sm:inline-flex`, el <span> del texto es block y cae debajo de los
  // puntos del icono en DetailModal, aunque Compartir sí permanece horizontal.
  assert.match(
    source,
    /showExternalLinksLabel \? "sm:inline-flex sm:h-auto sm:w-auto sm:gap-2/,
  );
});
