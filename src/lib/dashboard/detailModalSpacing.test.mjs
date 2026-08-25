import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const DETAIL_MODAL = new URL(
  "../../components/dashboard/DetailModal.jsx",
  import.meta.url,
);

test("las secciones de DetailModal conservan una separación vertical legible", async () => {
  const modal = await readFile(DETAIL_MODAL, "utf8");

  assert.match(modal, /<div className="space-y-8 p-5 sm:p-7">/);
  assert.equal(
    (modal.match(/className="space-y-4"/g) || []).length,
    3,
    "Reparto, títulos similares y sentimientos deben separar su encabezado del contenido",
  );
  assert.match(modal, /className="space-y-5 pb-4"/);
});
