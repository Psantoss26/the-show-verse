import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const componentPath = path.resolve(
  currentDirectory,
  "../../components/details/DetailActionsRow.jsx",
);

test("series and movie mobile action rows share the same button sizing contract", async () => {
  const source = await readFile(componentPath, "utf8");
  const sharedClassUses = source.match(/\$\{MOBILE_ACTION_BUTTON_CLASS\}/g) || [];

  assert.equal(sharedClassUses.length, 2);
  assert.match(
    source,
    /\[&_\[data-liquid-button\]:not\(\.labeled\)\]:!w-full/,
  );
  assert.match(
    source,
    /\[&_\[data-liquid-button\]:not\(\.labeled\)\]:aspect-square/,
  );
  assert.match(
    source,
    /\[&_\[data-liquid-button\]:not\(\.labeled\)\]:\[container-type:inline-size\]/,
  );
});
