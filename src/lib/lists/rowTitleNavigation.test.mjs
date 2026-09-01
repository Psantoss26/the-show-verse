import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const listsPage = readFileSync(
  new URL("../../app/lists/page.jsx", import.meta.url),
  "utf8",
);

test("las filas enlazan los detalles desde el título y solo muestran borrar en el modo móvil", () => {
  const rowSection = listsPage.slice(
    listsPage.indexOf("const RowListSection"),
    listsPage.indexOf("const ListModeRow"),
  );

  assert.match(
    rowSection,
    /<ListNavWrapper[\s\S]*?<h3[\s\S]*?{list\.name}[\s\S]*?<\/h3>[\s\S]*?<\/ListNavWrapper>/,
  );
  assert.doesNotMatch(rowSection, /Ver todo/i);
  assert.match(
    rowSection,
    /canUse && mobileDeleteMode[\s\S]*?title="Borrar lista"[\s\S]*?<Trash2/,
  );
  assert.match(rowSection, /lg:hidden/);
});
