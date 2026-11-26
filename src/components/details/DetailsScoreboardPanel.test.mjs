import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("./DetailsScoreboardPanel.jsx", import.meta.url);

test("el botón etiquetado de enlaces alinea icono y texto en una sola fila", async () => {
  const source = await readFile(sourceUrl, "utf8");

  // Sin `sm:inline-flex`, el <span> del texto es block y cae debajo de los
  // puntos del icono en DetailModal, aunque Compartir sí permanece horizontal.
  assert.match(
    source,
    /showExternalLinksLabel \? "sm:inline-flex sm:h-auto sm:w-auto sm:gap-2/,
  );
});

test("una puntuación pendiente no elegida para el teléfono no deja un ítem flex vacío", async () => {
  const source = await readFile(sourceUrl, "utf8");

  // El envoltorio invisible del hueco reservado es el ítem flex de la fila
  // repartida (`justify-evenly`). Si una puntuación NO elegida (p. ej. TMDb)
  // sigue pendiente, ese envoltorio tiene que retirarse con `.phoneOff`; si no,
  // cuenta como un hueco más y desplaza la primera puntuación (Letterboxd)
  // hasta que llega la nota.
  assert.match(
    source,
    /className=\{`invisible \$\{spread && !onPhone\(name\) \? styles\.phoneOff : ""\}`\}/,
  );
});
