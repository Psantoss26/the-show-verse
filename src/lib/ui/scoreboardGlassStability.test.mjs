import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const FICHA = new URL("../../components/DetailsClient.jsx", import.meta.url);
const SEASON = new URL("../../components/SeasonDetailsClient.jsx", import.meta.url);
const EPISODE = new URL("../../components/EpisodeDetailsClient.jsx", import.meta.url);
const PANEL = new URL(
  "../../components/details/DetailsScoreboardPanel.jsx",
  import.meta.url,
);

test("el panel es UNA sola superficie compartida", async () => {
  const panel = await readFile(PANEL, "utf8");

  // Si alguien copiara el acabado a una página, dejarían de ser el mismo panel.
  //
  // El acabado se consume ya como receta compartida: `LIQUID_GLASS_SURFACE` es
  // exactamente `relative isolate overflow-hidden transform-gpu` +
  // LIQUID_GLASS_BAR, las mismas clases que antes se escribían aquí a mano.
  assert.match(panel, /import \{ LIQUID_GLASS_SURFACE \} from "@\/lib\/ui\/liquidGlass"/);
  assert.match(panel, /w-full rounded-2xl \$\{LIQUID_GLASS_SURFACE\}/);
});

test("ninguna página altera el cristal del panel al invocarlo", async () => {
  const fuentes = await Promise.all([
    readFile(FICHA, "utf8"),
    readFile(SEASON, "utf8"),
    readFile(EPISODE, "utf8"),
  ]);

  for (const source of fuentes) {
    const uso = source.match(/<DetailsScoreboardPanel[\s\S]{0,400}?className=("[^"]*")/);
    // Solo se admite margen: cualquier fondo, desenfoque o sombra aquí
    // separaría esa página de las otras dos.
    if (uso) {
      assert.doesNotMatch(uso[1], /bg-|backdrop-|shadow-|rounded-/);
    }
  }
});

test("la entrada no atenúa los ancestros del marcador", async () => {
  // `opacity < 1` en un ancestro convierte la columna en backdrop root y el
  // ScoreboardPanel no puede desenfocar el fondo hasta terminar el fundido.
  // El desplazamiento vertical es seguro y conserva el cristal en el primer
  // fotograma visible, como en DetailsClient.
  for (const url of [SEASON, EPISODE]) {
    const source = await readFile(url, "utf8");
    const heroStart = source.indexOf("{/* Hero */}");
    const posterStart = source.indexOf("{/* Left", heroStart);
    const hero = source.slice(heroStart, posterStart);
    const columnStart = source.indexOf("{/* Right info", heroStart);
    const scoreboardStart = source.indexOf("<DetailsScoreboardPanel", columnStart);
    const column = source.slice(columnStart, scoreboardStart);

    assert.match(hero, /initial=\{\{ y: 16 \}\}/);
    assert.match(hero, /animate=\{\{ y: 0 \}\}/);
    assert.doesNotMatch(hero, /opacity:/);
    assert.match(column, /<div/);
    assert.doesNotMatch(column, /opacity:/);
    assert.doesNotMatch(column, /transform-gpu/);
  }
});
