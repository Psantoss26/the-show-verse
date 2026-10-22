import assert from "node:assert/strict";
import test from "node:test";

import { formatNetWorth, pickNetWorth } from "./netWorth.js";

// Declaración P2218 con la forma que devuelve `wbgetentities` (props=claims).
const claim = ({ amount, unit = "Q4917", year, rank = "normal", snaktype = "value" }) => ({
  rank,
  mainsnak: {
    snaktype,
    property: "P2218",
    datavalue: {
      type: "quantity",
      value: { amount: `+${amount}`, unit: `http://www.wikidata.org/entity/${unit}` },
    },
  },
  ...(year
    ? {
        qualifiers: {
          P585: [
            {
              snaktype: "value",
              datavalue: { value: { time: `+${year}-00-00T00:00:00Z`, precision: 9 } },
            },
          ],
        },
      }
    : {}),
});

test("sin declaraciones P2218 no hay patrimonio", () => {
  assert.equal(pickNetWorth({}), null);
  assert.equal(pickNetWorth(null), null);
  assert.equal(pickNetWorth({ P2218: [] }), null);
});

test("elige la cifra más reciente", () => {
  const picked = pickNetWorth({
    P2218: [
      claim({ amount: 50000000, year: 2015 }),
      claim({ amount: 120000000, year: 2023 }),
      claim({ amount: 90000000, year: 2019 }),
    ],
  });
  assert.deepEqual(picked, { amount: 120000000, currency: "USD", year: 2023 });
});

test("el rango preferente gana a una fecha más reciente", () => {
  const picked = pickNetWorth({
    P2218: [
      claim({ amount: 300000000, year: 2024 }),
      claim({ amount: 250000000, year: 2020, rank: "preferred" }),
    ],
  });
  assert.equal(picked.amount, 250000000);
});

test("descarta las obsoletas, los valores desconocidos y monedas sin mapear", () => {
  assert.equal(
    pickNetWorth({
      P2218: [
        claim({ amount: 10000000, year: 2024, rank: "deprecated" }),
        claim({ amount: 10000000, snaktype: "somevalue" }),
        claim({ amount: 10000000, unit: "Q999999999" }),
        claim({ amount: 0 }),
      ],
    }),
    null,
  );
});

test("sin fecha también vale, por detrás de las fechadas", () => {
  assert.deepEqual(pickNetWorth({ P2218: [claim({ amount: 8500000, unit: "Q4916" })] }), {
    amount: 8500000,
    currency: "EUR",
    year: null,
  });
  const picked = pickNetWorth({
    P2218: [claim({ amount: 1 * 1e6 }), claim({ amount: 2 * 1e6, year: 2010 })],
  });
  assert.equal(picked.year, 2010);
});

test("formato legible en castellano", () => {
  assert.equal(formatNetWorth({ amount: 120e6, currency: "USD" }), "120 millones de dólares");
  assert.equal(formatNetWorth({ amount: 1.2e9, currency: "USD" }), "1,2 mil millones de dólares");
  assert.equal(formatNetWorth({ amount: 1e6, currency: "EUR" }), "1 millón de euros");
  assert.equal(formatNetWorth({ amount: 8.5e6, currency: "GBP" }), "8,5 millones de libras");
  assert.equal(formatNetWorth({ amount: 450000, currency: "EUR" }), "450.000 euros");
  assert.equal(formatNetWorth(null), null);
});
