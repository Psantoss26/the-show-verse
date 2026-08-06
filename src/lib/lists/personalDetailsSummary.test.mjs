import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const personalListDetailsPath = new URL(
  "../../app/lists/[listId]/page.jsx",
  import.meta.url,
);

test("Mis listas no duplica elementos, fuente y modo en tarjetas", async () => {
  const source = await readFile(personalListDetailsPath, "utf8");
  const layout = source.slice(
    source.indexOf("<UnifiedListDetailsLayout"),
    source.indexOf('backHref="/lists"'),
  );

  assert.match(layout, /badges=/);
  assert.doesNotMatch(layout, /stats=/);
  assert.doesNotMatch(layout, /label: 'Elementos'/);
  assert.doesNotMatch(layout, /label: 'Fuente'/);
  assert.doesNotMatch(layout, /label: 'Modo'/);
});
