import assert from "node:assert/strict";
import test from "node:test";

import { careerRange, formatCareerRange } from "./careerRange.js";

// Caso REAL: Zendaya (n. 1996) aparece en un episodio de "Golden Globe Awards",
// que en TMDb es una serie estrenada en 1944. Como los créditos de TV se fechan
// con el estreno de la serie, su trayectoria empezaba 52 años antes de nacer.
const ZENDAYA = [
  { titulo: "Golden Globe Awards", year: 1944 },
  { titulo: "Shake It Up", year: 2010 },
  { titulo: "Euphoria", year: 2019 },
  { titulo: "Dune: Parte dos", year: 2024 },
];

test("un crédito anterior al nacimiento no cuenta", async () => {
  assert.deepEqual(careerRange(ZENDAYA, "1996-09-01"), {
    start: 2010,
    end: 2024,
  });
  assert.equal(formatCareerRange(careerRange(ZENDAYA, "1996-09-01")), "2010 - 2024");
});

test("sin fecha de nacimiento no se descarta nada", async () => {
  // No hay con qué comparar. Se enseña el dato tal cual antes que inventarlo.
  assert.deepEqual(careerRange(ZENDAYA, null), { start: 1944, end: 2024 });
  assert.deepEqual(careerRange(ZENDAYA, undefined), { start: 1944, end: 2024 });
  assert.deepEqual(careerRange(ZENDAYA, ""), { start: 1944, end: 2024 });
});

test("el año del nacimiento SÍ cuenta", async () => {
  // Hay bebés acreditados el mismo año en que nacen; el filtro es "anterior a",
  // no "anterior o igual".
  const creditos = [{ year: 2004 }, { year: 2016 }];
  assert.deepEqual(careerRange(creditos, "2004-02-19"), {
    start: 2004,
    end: 2016,
  });
});

test("si TODO es anterior al nacimiento, se muestra sin filtrar", async () => {
  // Datos rotos de origen: mejor un rango raro que un hueco.
  const creditos = [{ year: 1960 }, { year: 1975 }];
  assert.deepEqual(careerRange(creditos, "1990-01-01"), {
    start: 1960,
    end: 1975,
  });
});

test("años ausentes o basura se ignoran", async () => {
  const creditos = [
    { year: 0 },
    { year: null },
    { year: undefined },
    { titulo: "sin year" },
    { year: "2015" },
    { year: 2020 },
  ];
  assert.deepEqual(careerRange(creditos, "1990-01-01"), {
    start: 2015,
    end: 2020,
  });
});

test("sin créditos utilizables devuelve null y se pinta el guion", async () => {
  assert.equal(careerRange([], "1990-01-01"), null);
  assert.equal(careerRange(null, "1990-01-01"), null);
  assert.equal(formatCareerRange(null), "—");
});

test("un solo año no se pinta como rango", async () => {
  assert.equal(
    formatCareerRange(careerRange([{ year: 2021 }], "1999-01-01")),
    "2021",
  );
});
