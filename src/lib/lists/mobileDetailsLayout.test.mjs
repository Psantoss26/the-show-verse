import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ACTIONS = new URL(
  "../../components/lists/ListDetailsActionRow.jsx",
  import.meta.url,
);
const SUBROUTE_ACTIONS = new URL(
  "../../components/details/SubrouteDetailsActionRow.jsx",
  import.meta.url,
);
const SCOREBOARD = new URL(
  "../../components/details/DetailsScoreboardPanel.jsx",
  import.meta.url,
);

test("las acciones móviles de listas conservan el tamaño de DetailsClient", async () => {
  const source = await readFile(ACTIONS, "utf8");

  assert.match(source, /\[&>\*\]:max-w-\[60px\]/);
  assert.match(source, /\$\{MOBILE_ACTION_BUTTON_CLASS\}/);
});

test("las acciones móviles de temporadas y episodios conservan el mismo tamaño", async () => {
  const source = await readFile(SUBROUTE_ACTIONS, "utf8");

  assert.match(source, /\[&>\*\]:max-w-\[60px\]/);
  assert.match(source, /\$\{MOBILE_ACTION_BUTTON_CLASS\}/);
});

test("Compartir queda anclado al borde derecho también en móvil", async () => {
  const source = await readFile(SCOREBOARD, "utf8");

  assert.match(source, /className="ml-auto shrink-0 max-sm:\[&>button\]/);
  assert.doesNotMatch(source, /shrink-0 sm:ml-auto max-sm:\[&>button\]/);
});
