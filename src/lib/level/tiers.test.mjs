// src/lib/level/tiers.test.mjs
import assert from "node:assert/strict";
import test from "node:test";

import {
  LEVEL_TIER_VISUALS,
  RARITY_VISUALS,
  tierVisual,
  rarityVisual,
  formatXp,
  ACHIEVEMENT_FAMILY_LABELS,
} from "./tiers.mjs";

// El backend manda el rango por id (backend/src/level/curve.js). El frontend solo
// decide cómo se ve, así que la única obligación es cubrir los ocho.
const BACKEND_TIER_IDS = [
  "espectador",
  "aficionado",
  "cinefilo",
  "critico",
  "coleccionista",
  "archivista",
  "maestro",
  "leyenda",
];

test("hay vestimenta para los ocho rangos del backend", () => {
  for (const id of BACKEND_TIER_IDS) {
    assert.ok(LEVEL_TIER_VISUALS[id], `falta el rango ${id}`);
  }
  assert.equal(Object.keys(LEVEL_TIER_VISUALS).length, BACKEND_TIER_IDS.length);
});

test("cada rango trae color de trazo, chip y barra", () => {
  for (const [id, visual] of Object.entries(LEVEL_TIER_VISUALS)) {
    assert.match(visual.hex, /^#[0-9a-f]{6}$/i, `${id}: hex inválido`);
    assert.match(visual.hexDeep, /^#[0-9a-f]{6}$/i, `${id}: hexDeep inválido`);
    assert.ok(visual.chip.includes("text-"), `${id}: el chip necesita color de texto`);
    assert.ok(visual.bar.includes("from-"), `${id}: la barra necesita degradado`);
    assert.ok(visual.name, `${id}: falta nombre`);
  }
});

test("tierVisual acepta el objeto de rango que envía la API", () => {
  const visual = tierVisual({ id: "cinefilo", name: "Cinéfilo" });
  assert.equal(visual.name, "Cinéfilo");
  assert.equal(visual.hex, LEVEL_TIER_VISUALS.cinefilo.hex);
});

test("tierVisual acepta también el id a secas", () => {
  assert.equal(tierVisual("leyenda").hex, LEVEL_TIER_VISUALS.leyenda.hex);
});

test("un rango desconocido cae en el primero en vez de romper la vista", () => {
  // Si el backend añadiera un rango antes de que el frontend lo conozca, la
  // insignia debe seguir pintándose.
  assert.equal(tierVisual("rango-del-futuro").hex, LEVEL_TIER_VISUALS.espectador.hex);
  assert.equal(tierVisual(null).hex, LEVEL_TIER_VISUALS.espectador.hex);
  assert.equal(tierVisual(undefined).hex, LEVEL_TIER_VISUALS.espectador.hex);
});

test("tierVisual respeta el nombre que manda la API sobre el local", () => {
  // El backend es la fuente de verdad de los nombres.
  assert.equal(tierVisual({ id: "cinefilo", name: "Cinéfila" }).name, "Cinéfila");
});

test("hay vestimenta para las cuatro rarezas de logro", () => {
  for (const rarity of ["comun", "raro", "epico", "legendario"]) {
    assert.ok(RARITY_VISUALS[rarity], `falta la rareza ${rarity}`);
    assert.ok(rarityVisual(rarity).label, `${rarity}: falta etiqueta`);
  }
});

test("una rareza desconocida cae en la común", () => {
  assert.equal(rarityVisual("mitico").label, RARITY_VISUALS.comun.label);
});

test("hay etiqueta en español para cada familia de logros", () => {
  for (const family of [
    "visionado",
    "series",
    "critica",
    "coleccion",
    "social",
    "constancia",
    "rareza",
  ]) {
    assert.ok(ACHIEVEMENT_FAMILY_LABELS[family], `falta la familia ${family}`);
  }
});

test("el XP se agrupa según la convención española", () => {
  // En español los números de cuatro cifras van SIN separador y a partir de cinco
  // con punto. Es lo que hace Intl con es-ES y lo que debe ver el usuario.
  assert.equal(formatXp(9543), "9543");
  assert.equal(formatXp(79950), "79.950");
  assert.equal(formatXp(0), "0");
});

test("formatXp no imprime NaN cuando el dato falta", () => {
  assert.equal(formatXp(null), "0");
  assert.equal(formatXp(undefined), "0");
  assert.equal(formatXp("x"), "0");
});
