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

test("la columna del marcador es raíz de composición PERMANENTE", async () => {
  // ESTE es el arreglo. La columna entra con un fundido y `opacity < 1` abre una
  // raíz de composición: mientras dura, el `backdrop-filter` del panel no ve el
  // fondo de la página. Al acabar, framer-motion retira la opacidad, la raíz
  // desaparece y el cristal se "enciende" de golpe -- el salto que se veía en
  // temporada y episodio y no en la ficha.
  //
  // Con `transform-gpu` de CLASE la raíz sobrevive al fundido, igual que en la
  // ficha completa, y el panel se ve idéntico desde el primer fotograma.
  for (const url of [SEASON, EPISODE]) {
    const source = await readFile(url, "utf8");
    assert.match(
      source,
      /className="flex-1 flex flex-col min-w-0 w-full transform-gpu"/,
      "la columna del marcador perdió su raíz de composición permanente",
    );
  }
});

test("framer no anima transform en esa columna, o pisaría la clase", async () => {
  // Si esa columna pasara a animar `y`/`scale`, framer escribiría `transform`
  // en línea y lo dejaría en `none` al terminar: volvería el salto.
  for (const url of [SEASON, EPISODE]) {
    const source = await readFile(url, "utf8");
    const i = source.indexOf(
      'className="flex-1 flex flex-col min-w-0 w-full transform-gpu"',
    );
    const bloque = source.slice(Math.max(0, i - 700), i);
    const animadas = [...bloque.matchAll(/[{,]\s*(y|x|scale|rotate):/g)];
    assert.equal(
      animadas.length,
      0,
      "la columna anima un transform: framer lo dejaría en `none` y el cristal volvería a saltar",
    );
  }
});
