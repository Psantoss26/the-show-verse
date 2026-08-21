import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const personalListDetailsPath = new URL(
  "../../app/lists/[listId]/page.jsx",
  import.meta.url,
);

test("Mis listas declara los datos para el layout de detalles compartido", async () => {
  const source = await readFile(personalListDetailsPath, "utf8");
  const layout = source.slice(
    source.indexOf("<UnifiedListDetailsLayout"),
    source.indexOf('backHref="/lists"'),
  );

  assert.match(layout, /metaItems=/);
  assert.match(layout, /scoreboardStats=/);
  assert.match(layout, /detailCards=/);
  assert.match(layout, /productionCards=/);
  assert.match(layout, /infoTabsKey=/);
});
