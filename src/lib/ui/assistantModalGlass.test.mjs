import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { LIQUID_GLASS_PANEL } from "./liquidGlass.js";

const assistantPath = new URL(
  "../../components/WatchNextAssistant.jsx",
  import.meta.url,
);
const addToListPath = new URL(
  "../../components/details/AddToListModal.jsx",
  import.meta.url,
);

// Superficie del diálogo (el panel), no el velo ni el contenido.
function dialogSurface(source) {
  const i = source.indexOf('role="dialog"');
  assert.ok(i > -1, "no se localiza el diálogo");
  const className = source.slice(i).match(/className=\{?[`"]([\s\S]*?)[`"]\}?\s*\n/);
  assert.ok(className, "no se localiza el className del diálogo");
  return className[1];
}

test("el modal del asistente usa el acabado compartido", async () => {
  const assistant = await readFile(assistantPath, "utf8");

  assert.match(assistant, /import \{ LIQUID_GLASS_PANEL \} from "@\/lib\/ui\/liquidGlass"/);
  assert.match(dialogSurface(assistant), /\$\{LIQUID_GLASS_PANEL\}/);
});

test("el asistente ya no lleva su propia versión del cristal", async () => {
  const assistant = await readFile(assistantPath, "utf8");
  const surface = dialogSurface(assistant);

  // La receta a mano que tenía. Cada una de estas era una desviación respecto
  // a `LIQUID_GLASS_PANEL`: más tinte, muchísimo más desenfoque, sin saturar y
  // con otra sombra. Volver a introducirlas es la deriva que la constante
  // existe para impedir (ver la cabecera de liquidGlass.js).
  assert.doesNotMatch(surface, /bg-black\/45/);
  assert.doesNotMatch(surface, /backdrop-blur-3xl/);
  assert.doesNotMatch(surface, /shadow-\[inset_0_1\.5px_2px/);
});

test("la forma sigue siendo propia del asistente", async () => {
  // La constante aporta el ACABADO; alto, ancho y radio son de cada superficie.
  const surface = dialogSurface(await readFile(assistantPath, "utf8"));

  assert.match(surface, /h-\[100dvh\]/);
  assert.match(surface, /max-w-5xl/);
  assert.match(surface, /sm:rounded-\[2rem\]/);
});

test("el velo del asistente es el mismo que el de los modales de la ficha", async () => {
  const assistant = await readFile(assistantPath, "utf8");
  const addToList = await readFile(addToListPath, "utf8");

  // El velo forma parte de la receta: oscurece y difumina el fondo para que el
  // cristal del panel tenga algo coherente que atravesar.
  const veloFicha = addToList.match(/bg-black\/(\d+) backdrop-blur-(\w+)/);
  assert.ok(veloFicha, "no se localiza el velo del modal de la ficha");
  assert.match(
    assistant,
    new RegExp(`bg-black\\/${veloFicha[1]} backdrop-blur-${veloFicha[2]}`),
    `el asistente debería usar el mismo velo que la ficha (${veloFicha[0]})`,
  );
  assert.doesNotMatch(assistant, /bg-black\/80 lg:bg-black\/90/);
});

test("la constante sigue siendo el acabado y no la forma", async () => {
  // Si alguien mete radio o tamaño en la constante, dejaría de poder
  // compartirse entre superficies con formas distintas.
  // Los límites de palabra importan: `shadow-[` contiene la subcadena `w-[`.
  assert.doesNotMatch(LIQUID_GLASS_PANEL, /(^|\s)(rounded-|max-w-|h-\[|w-\[)/);
  assert.match(LIQUID_GLASS_PANEL, /backdrop-blur-\[16px\]/);
  assert.match(LIQUID_GLASS_PANEL, /saturate-\[140%\]/);
});
