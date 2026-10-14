import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("SeriesGraph and rating dialogs share the bundled Inter number style", () => {
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
  assert.match(rating, /sv-seriesgraph-number/);
  assert.match(episodes, /sv-seriesgraph-number/);
});
