import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Las tarjetas de sentimientos existen DOS VECES: en la ficha completa
// (DetailsClient) y en la ficha rápida del dashboard (DetailModal). Este test
// las mantiene atadas: son la misma pieza vista en dos sitios, y que una se
// quede atrás es exactamente lo que había pasado (el modal conservaba contorno,
// cristal propio y un tinte más flojo).
const FICHA = new URL("../../components/DetailsClient.jsx", import.meta.url);
const MODAL = new URL("../../components/dashboard/DetailModal.jsx", import.meta.url);

function tarjeta(source, color) {
  const rx = new RegExp(`className="([^"]*from-${color}-500/15[^"]*)"`);
  const m = source.match(rx);
  assert.ok(m, `no se localiza la tarjeta ${color}`);
  return m[1];
}

test("la ficha y el modal pintan la misma tarjeta", async () => {
  const [ficha, modal] = await Promise.all([
    readFile(FICHA, "utf8"),
    readFile(MODAL, "utf8"),
  ]);

  for (const color of ["emerald", "rose"]) {
    assert.equal(
      tarjeta(modal, color),
      tarjeta(ficha, color),
      `la tarjeta ${color} difiere entre DetailsClient y DetailModal`,
    );
  }
});

test("las tarjetas no llevan contorno ni cristal propio", async () => {
  const modal = await readFile(MODAL, "utf8");

  for (const color of ["emerald", "rose"]) {
    const clases = tarjeta(modal, color);
    // El contorno dibujaba un canto por columna y rompía la superficie continua.
    assert.doesNotMatch(clases, /border/);
    // El cristal lo pone la superficie de debajo; repetirlo por tarjeta añade un
    // canto luminoso a cada una.
    assert.doesNotMatch(clases, /backdrop-/);
    // Lo que sí llevan: el tinte con su parada intermedia.
    assert.match(clases, new RegExp(`via-${color}-500/\\[0\\.04\\]`));
  }
});
