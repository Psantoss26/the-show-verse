import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const modalPath = new URL(
  "../../components/details/AddToListModal.jsx",
  import.meta.url,
);
const detailsPath = new URL("../../components/DetailsClient.jsx", import.meta.url);
const previewPath = new URL(
  "../../components/dashboard/DetailModal.jsx",
  import.meta.url,
);

test("el selector de listas permite añadir y quitar un título", async () => {
  const source = await readFile(modalPath, "utf8");

  assert.match(source, /onRemoveFromList = null/);
  assert.match(source, /if \(canRemove\) onRemoveFromList\(id\)/);
  assert.match(source, /disabled=\{busy \|\| \(present && !canRemove\)\}/);
  assert.match(source, /aria-pressed=\{present\}/);
  assert.doesNotMatch(source, /Añadida · pulsa para quitar/);
  assert.match(source, /l\?\.description \|\| "Sin descripción"/);
});

test("DetailsClient y DetailModal conectan la eliminación persistente", async () => {
  const [details, preview] = await Promise.all([
    readFile(detailsPath, "utf8"),
    readFile(previewPath, "utf8"),
  ]);

  for (const source of [details, preview]) {
    assert.match(
      source,
      /removeMovieFromList as backendRemoveMovieFromList/,
    );
    assert.match(source, /await backendRemoveMovieFromList\(\{/);
    assert.match(
      source,
      /onRemoveFromList=\{handleRemoveFromSpecificList\}/,
    );
  }
});
