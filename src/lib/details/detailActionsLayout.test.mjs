import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const componentPath = path.resolve(
  currentDirectory,
  "../../components/details/DetailActionsRow.jsx",
);
const liquidButtonPath = path.resolve(
  currentDirectory,
  "../../components/LiquidButton.jsx",
);
const starRatingPath = path.resolve(
  currentDirectory,
  "../../components/StarRating.jsx",
);
const watchedControlPath = path.resolve(
  currentDirectory,
  "../../components/trakt/TraktWatchedControl.jsx",
);
const recommendationsPath = path.resolve(
  currentDirectory,
  "../../app/recommendations/RecommendationsClient.jsx",
);

test("series and movie mobile action rows share the same button sizing contract", async () => {
  const source = await readFile(componentPath, "utf8");
  const sharedClassUses = source.match(/\$\{MOBILE_ACTION_BUTTON_CLASS\}/g) || [];

  assert.equal(sharedClassUses.length, 2);
  assert.match(
    source,
    /\[&_\[data-liquid-button\]:not\(\.labeled\)\]:!w-full/,
  );
  assert.match(
    source,
    /\[&_\[data-liquid-button\]:not\(\.labeled\)\]:aspect-square/,
  );
  assert.match(
    source,
    /\[&_\[data-liquid-button\]:not\(\.labeled\)\]:\[container-type:inline-size\]/,
  );
});

test("all detail action variants use the shared liquid glass surface", async () => {
  const [actions, liquidButton, starRating, watchedControl, recommendations] =
    await Promise.all([
      readFile(componentPath, "utf8"),
      readFile(liquidButtonPath, "utf8"),
      readFile(starRatingPath, "utf8"),
      readFile(watchedControlPath, "utf8"),
      readFile(recommendationsPath, "utf8"),
    ]);

  assert.match(
    actions,
    /function LiquidButton\(props\)[\s\S]*?<BaseLiquidButton \{\.\.\.props\} liquidGlass \/>/,
  );
  assert.match(actions, /<TraktWatchedControl[\s\S]*?liquidGlass/);
  assert.match(actions, /<StarRating[\s\S]*?liquidGlass/);
  assert.match(liquidButton, /liquidGlass = false/);
  assert.match(
    liquidButton,
    /const surfaceClass = liquidGlass\s*\? LIQUID_GLASS_CARD/,
  );
  assert.match(
    liquidButton,
    /liquidGlass && <LiquidGlassOpticalLayers \/>/,
  );
  assert.match(starRating, /<LiquidButton[\s\S]*?liquidGlass=\{liquidGlass\}/);
  assert.match(
    watchedControl,
    /<LiquidButton[\s\S]*?liquidGlass=\{liquidGlass\}/,
  );
  assert.match(
    recommendations,
    /function RecommendationActionButton[\s\S]*?<LiquidButton\s+liquidGlass/,
  );
});
