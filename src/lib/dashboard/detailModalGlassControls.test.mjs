import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const detailModalPath = new URL(
  "../../components/dashboard/DetailModal.jsx",
  import.meta.url,
);

test("los controles superiores de DetailModal reutilizan el liquid glass del navbar", async () => {
  const source = await readFile(detailModalPath, "utf8");
  const uses = source.match(/\$\{DETAIL_MODAL_GLASS_CONTROL\}/g) || [];

  assert.match(
    source,
    /import \{ LIQUID_GLASS_PANEL \} from "@\/lib\/ui\/liquidGlass"/,
  );
  assert.match(
    source,
    /const DETAIL_MODAL_GLASS_CONTROL = `\$\{LIQUID_GLASS_PANEL\}/,
  );
  assert.equal(uses.length, 2);
  assert.doesNotMatch(source, /bg-black\/\[0\.48\]/);
  assert.match(source, /DETAIL_MODAL_GLASS_CONTROL = `[^`]*border-0/);
  assert.doesNotMatch(source, /DETAIL_MODAL_GLASS_CONTROL = `[^`]*border-white/);
});
