import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const toolsPath = new URL(
  "../../components/lists/ListDetailsTools.jsx",
  import.meta.url,
);
const personalDetailsPath = new URL(
  "../../app/lists/[listId]/page.jsx",
  import.meta.url,
);

test("los buscadores del detalle de listas muestran el icono con el formato del menú", async () => {
  const [tools, personalDetails] = await Promise.all([
    readFile(toolsPath, "utf8"),
    readFile(personalDetailsPath, "utf8"),
  ]);

  const sharedIcons =
    tools.match(
      /<Search[\s\S]*?className="pointer-events-none absolute left-3\.5 top-1\/2 z-10 h-4 w-4 shrink-0 -translate-y-1\/2 text-purple-400"/g,
    ) || [];

  assert.equal(sharedIcons.length, 2);
  assert.match(
    personalDetails,
    /<Search[\s\S]*?className="pointer-events-none absolute left-3 top-1\/2 z-10 h-4 w-4 shrink-0 -translate-y-1\/2 text-purple-400"/,
  );
});
