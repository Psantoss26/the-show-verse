import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const SEASON = new URL("../../components/SeasonDetailsClient.jsx", import.meta.url);
const EPISODE = new URL("../../components/EpisodeDetailsClient.jsx", import.meta.url);
const FICHA = new URL("../../components/DetailsClient.jsx", import.meta.url);

// Firma del cristal hecho A MANO: la capa de reflejo interior que acompañaba a
// cada copia del acabado. Es lo que delata que una superficie no usa la receta
// compartida.
const A_MANO = /shadow-\[inset_0_1px_2px_rgba\(255,255,255,0\.15\)/g;

test("las tarjetas de episodio usan la receta compartida", async () => {
  const season = await readFile(SEASON, "utf8");

  assert.match(season, /import \{ LIQUID_GLASS_CARD \} from "@\/lib\/ui\/liquidGlass"/);
  assert.match(season, /\$\{LIQUID_GLASS_CARD\}/);
  assert.match(season, /<LiquidGlassOpticalLayers \/>/);

  // Su copia a mano: 64px de desenfoque y un velo que no dejaba pasar color.
  assert.doesNotMatch(season, /bg-zinc-900\/20 backdrop-blur-2xl/);
});

test("se usa la variante SIN sombra, porque los episodios van en lista", async () => {
  const season = await readFile(SEASON, "utf8");

  // `LIQUID_GLASS_BAR` (el del ScoreboardPanel) lleva sombra: apilada en una
  // lista, la de cada tarjeta se solapa con la vecina y forma una banda oscura
  // detrás del grupo. Por eso existe la variante CARD.
  const tarjeta = season.match(/className=\{`group relative isolate block[^`]*`\}/)?.[0];
  assert.ok(tarjeta, "no se localiza la tarjeta de episodio");
  assert.match(tarjeta, /\$\{LIQUID_GLASS_CARD\}/);
  assert.doesNotMatch(tarjeta, /LIQUID_GLASS_BAR/);
});

test("solo queda cristal a mano donde YA coincide con la ficha", async () => {
  const [season, episode, ficha] = await Promise.all([
    readFile(SEASON, "utf8"),
    readFile(EPISODE, "utf8"),
    readFile(FICHA, "utf8"),
  ]);

  // Lo que queda es el chip de icono de `SectionTitle`, que está duplicado
  // VERBATIM en los tres ficheros: ya comparte diseño, así que tocarlo aquí lo
  // habría separado de la ficha en vez de acercarlo.
  for (const [nombre, source] of [
    ["SeasonDetailsClient", season],
    ["EpisodeDetailsClient", episode],
  ]) {
    assert.equal(
      (source.match(A_MANO) || []).length,
      1,
      `${nombre} tiene superficies con el acabado copiado a mano`,
    );
  }

  const chip = (s) => {
    const i = s.indexOf("rounded-[14px] bg-yellow-500/5");
    const j = s.lastIndexOf('className="', i);
    return s.slice(j, s.indexOf('"', j + 11) + 1);
  };
  assert.equal(chip(season), chip(ficha));
  assert.equal(chip(episode), chip(ficha));
});
