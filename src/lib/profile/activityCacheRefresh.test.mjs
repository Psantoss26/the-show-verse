import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Actividad revalida su caché al volver al perfil", async () => {
  const source = await readFile(
    new URL("../../app/u/[username]/ProfileSection.jsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /if \(!pendingListType && section !== "activity"\)/);
});
