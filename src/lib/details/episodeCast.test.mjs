import assert from "node:assert/strict";
import test from "node:test";

import { mergeEpisodeCast } from "./cast.js";

// Datos reales de TMDb: Ataque a los titanes T2E1. Takehito Koyasu (84508)
// está en el reparto como Zeke y entre los invitados como el Titán Bestia.
const cast = [
  { id: 1, name: "Yuki Kaji", character: "Eren Yeager (voice)" },
  { id: 84508, name: "Takehito Koyasu", character: "Zeke (voice)" },
];
const guestStars = [
  { id: 84508, name: "Takehito Koyasu", character: "The Beast Titan (voice)" },
  { id: 2, name: "Invitado", character: "Soldado" },
];

test("una persona en reparto e invitados sale UNA vez, con sus dos personajes", () => {
  const merged = mergeEpisodeCast(cast, guestStars);
  assert.deepEqual(
    merged.map((p) => p.id),
    [1, 84508, 2],
  );
  assert.equal(
    merged.find((p) => p.id === 84508).character,
    "Zeke (voice) / The Beast Titan (voice)",
  );
  assert.equal(new Set(merged.map((p) => p.id)).size, merged.length);
});

test("no repite un personaje igual ni deja huecos si falta", () => {
  const merged = mergeEpisodeCast(
    [{ id: 3, name: "A", character: "Rey" }],
    [
      { id: 3, name: "A", character: "Rey" },
      { id: 3, name: "A", character: "" },
    ],
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].character, "Rey");
});

test("respeta el límite DESPUÉS de quitar duplicados y tolera entradas vacías", () => {
  const many = Array.from({ length: 25 }, (_, i) => ({ id: i + 10, name: `P${i}` }));
  assert.equal(mergeEpisodeCast(many, many, 20).length, 20);
  assert.deepEqual(mergeEpisodeCast(null, undefined), []);
  assert.deepEqual(
    mergeEpisodeCast([null, { name: "sin id", credit_id: "c1" }], []).map((p) => p.name),
    ["sin id"],
  );
});
