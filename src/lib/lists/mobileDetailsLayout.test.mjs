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
const LIST_ACTION_MODAL = new URL(
  "../../components/lists/ListActionModal.jsx",
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
  const [page, modal] = await Promise.all([
    readFile(LIST_DETAILS_PAGE, "utf8"),
    readFile(LIST_ACTION_MODAL, "utf8"),
  ]);

  // Los cuatro modales de la página (añadir, editar, vaciar, borrar) usan el
  // modal compartido con el cristal de los de la ficha.
  assert.equal(page.match(/<ListActionModal\b/g)?.length, 4);
  assert.match(modal, /max-h-\[85dvh\] w-full \$\{SIZES\[size\] \|\| SIZES\.md\} flex-col overflow-hidden rounded-\[2rem\]/);
  assert.match(modal, /LIQUID_GLASS_PANEL/);
  assert.match(modal, /LIQUID_GLASS_MODAL_HEADER\} p-6 sm:px-8 sm:pb-6 sm:pt-8/);
  assert.match(modal, /flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white\/5/);
  assert.match(modal, /min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 sm:px-8/);
});

test("los campos de edición separan su etiqueta del recuadro", async () => {
  const [page, modal] = await Promise.all([
    readFile(LIST_DETAILS_PAGE, "utf8"),
    readFile(LIST_ACTION_MODAL, "utf8"),
  ]);

  assert.match(page, /<label className=\{MODAL_LABEL_CLASS\}>\s*Nombre/);
  assert.match(page, /<label className=\{MODAL_LABEL_CLASS\}>\s*Descripción/);
  // El recuadro va separado de la etiqueta (mt-2) y en bloque.
  assert.match(modal, /MODAL_FIELD_CLASS = 'mt-2 block w-full rounded-xl/);
});
