import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("SeriesGraph keeps Inter; rating numbers use the watched-count typography", () => {
  const layout = read("src/app/layout.jsx");
  const css = read("src/app/globals.css");
  const grid = read("src/components/EpisodeRatingsGrid.jsx");
  const rating = read("src/components/StarRating.jsx");
  const episodes = read("src/components/trakt/TraktEpisodesWatchedModal.jsx");

  assert.match(layout, /@fontsource-variable\/inter\/wght\.css/);
  assert.ok(
    existsSync(
      new URL(
        "node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
        root,
      ),
    ),
  );
  assert.match(
    css,
    /\.sv-seriesgraph-number\s*\{[\s\S]*font-family:\s*"Inter Variable"[\s\S]*font-variant-numeric:\s*tabular-nums lining-nums[\s\S]*font-weight:\s*800/,
  );
  assert.match(grid, /sv-seriesgraph-number/);
  // Botón de puntuación, modal de puntuación y notas de los episodios: la
  // misma tipografía que el número de visionados del botón de visto
  // (LiquidButton → playsCount: fuente de la app, font-black).
  const liquid = read("src/components/LiquidButton.jsx");
  assert.match(liquid, /className=\{`font-black leading-none \$\{\s*String\(playsCount\)\.length === 1\s*\? "text-2xl"\s*: "text-xl tracking-tighter"/);
  assert.match(rating, /font-black leading-none \$\{\s*fmt\(rating\)\.length === 1 \? "text-2xl" : "text-xl tracking-tighter"/);
  assert.match(rating, /text-6xl font-black leading-none tracking-tighter/);
  assert.match(episodes, /text-base font-black leading-none tracking-tighter/);
  assert.doesNotMatch(rating, /sv-seriesgraph-number/);
  assert.doesNotMatch(episodes, /sv-seriesgraph-number/);
});
