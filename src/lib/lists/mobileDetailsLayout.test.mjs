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
const LIST_DETAILS_PAGE = new URL(
  "../../app/lists/[listId]/page.jsx",
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

test("los diálogos de acciones de listas comparten el patrón de DetailsClient", async () => {
  const source = await readFile(LIST_DETAILS_PAGE, "utf8");

  assert.match(source, /max-h-\[85dvh\] w-full flex-col overflow-hidden rounded-\[2rem\]/);
  assert.match(source, /bg-white\/\[0\.025\] p-6 sm:px-8 sm:pb-6 sm:pt-8/);
  assert.match(source, /flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white\/5/);
  assert.match(source, /min-h-0 flex-1 overflow-y-auto p-6 pb-8 sm:px-8/);
});

test("los campos de edición separan su etiqueta del recuadro", async () => {
  const source = await readFile(LIST_DETAILS_PAGE, "utf8");

  assert.match(
    source,
    /<label className="block space-y-3 text-sm font-bold text-zinc-300">Nombre/,
  );
  assert.match(
    source,
    /<label className="block space-y-3 text-sm font-bold text-zinc-300">Descripción/,
  );
});
