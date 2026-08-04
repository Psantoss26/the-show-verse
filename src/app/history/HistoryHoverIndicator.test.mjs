import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const componentPath = path.resolve(currentDirectory, "HistoryClient.jsx");

test("centra de forma independiente el icono y la fecha del indicador hover", async () => {
  const source = await readFile(componentPath, "utf8");

  assert.match(
    source,
    /className={`grid \$\{itemClassName\} shrink-0 place-items-center/,
  );
  assert.match(source, /className={`block \$\{iconClassName\}`}/);
  assert.match(
    source,
    /className={`grid \$\{dateClassName\} shrink-0 place-items-center/,
  );
  assert.match(
    source,
    /className="tabular-nums leading-none \[text-box:trim-both_cap_alphabetic\]"/,
  );
});

test("mantiene las dimensiones visuales actuales del indicador", async () => {
  const source = await readFile(componentPath, "utf8");

  assert.match(source, /compact \? "h-7 w-7" : "h-9 w-8"/);
  assert.match(
    source,
    /compact \? "h-7 w-\[3\.65rem\] text-\[11px\]" : "h-9 w-16 text-sm"/,
  );
});

test("no reutiliza la referencia de temporada y episodio como titulo provisional", async () => {
  const source = await readFile(componentPath, "utf8");

  assert.doesNotMatch(
    source,
    /resolvedEpisodeTitle \|\| formatEpisodeBadge\(meta\)/,
  );
  assert.match(
    source,
    /min-h-\[1em\][^>]*>\s*\{resolvedEpisodeTitle\}/,
  );
});
