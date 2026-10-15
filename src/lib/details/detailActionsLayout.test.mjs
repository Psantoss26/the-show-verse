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
  // Las dos filas (la combinada de series y la estándar) eligen su contrato de
  // tamaño con la MISMA expresión: la mitad móvil cuando la fila se fuerza a
  // móvil —la ficha de teléfono del drawer, donde los `sm:` mirarían el
  // viewport de escritorio— y el contrato completo en cualquier otro caso.
  const sharedClassUses =
    source.match(
      /\$\{forceMobile \? MOBILE_ACTION_BUTTON_BASE : MOBILE_ACTION_BUTTON_CLASS\}/g,
    ) || [];

  assert.equal(sharedClassUses.length, 2);
  assert.match(
    source,
    /export const MOBILE_ACTION_BUTTON_CLASS = `\$\{MOBILE_ACTION_BUTTON_BASE\} \$\{DESKTOP_ACTION_BUTTON_OVERRIDES\}`;/,
  );
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
  // El cristal sale de la receta COMPARTIDA (`LIQUID_GLASS_SURFACE_CARD` =
  // envoltura + cristal sin sombra), no de clases repetidas aquí, y la
  // elevación es la misma de la familia (`LIQUID_GLASS_ELEVATION`): halo blanco
  // incluido, que es lo que hace que el botón se lea del mismo material que el
  // navbar y el menú de secciones.
  assert.match(
    liquidButton,
    /const surfaceClass = liquidGlass\s*\? LIQUID_GLASS_SURFACE_CARD/,
  );
  assert.match(
    liquidButton,
    /const elevationClass = liquidGlass\s*\? LIQUID_GLASS_ELEVATION/,
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

test("dashboard hover preview cards use size='md' with proportional intermediate 46px button, number, and gap scaling to preserve lateral margins", async () => {
  const [actions, continueWatching, backdropRow, mainDashboard] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(path.resolve(currentDirectory, "../../components/ContinueWatchingSection.jsx"), "utf8"),
    readFile(path.resolve(currentDirectory, "../../components/dashboard/DashboardBackdropRow.jsx"), "utf8"),
    readFile(path.resolve(currentDirectory, "../../components/MainDashboardClient.jsx"), "utf8"),
  ]);

  // DetailActionsRow defaults to size="md" (intermediate 46px scale)
  assert.match(actions, /size\s*=\s*"md"/);

  // DetailActionsRow scales numbers and icons proportionally in intermediate size="md"
  assert.match(actions, /sm:\[&.labeled-row_\[data-liquid-button\]:not\(\.labeled\)_\.text-xl\]:!text-\[20\.5px\]/);
  assert.match(actions, /sm:\[&.labeled-row_\[data-liquid-button\]:not\(\.labeled\)_\.text-2xl\]:!text-\[22\.5px\]/);
  assert.match(actions, /sm:\[&.labeled-row_\[data-liquid-button\]:not\(\.labeled\)_svg\]:!w-\[21px\]/);
  assert.match(actions, /sm:\[&.labeled-row\]:!gap-2/);
  assert.match(actions, /\[&.labeled-row>\*:not\(\.separator\):not\(\.labeled\)\]:!w-\[46px\]/);
  assert.match(actions, /\[&.labeled-row>\*:not\(\.separator\):not\(\.labeled\)\]:!h-\[46px\]/);

  // ContinueWatchingSection uses size="md"
  assert.match(continueWatching, /<DetailActionsRow[\s\S]*?compactLabelWhenTight[\s\S]*?size="md"/);

  // DashboardBackdropRow uses size="md"
  assert.match(backdropRow, /<DetailActionsRow[\s\S]*?compactLabelWhenTight[\s\S]*?size="md"/);

  // MainDashboardClient preview cards use size="md"
  const matches = mainDashboard.match(/<DetailActionsRow[\s\S]*?compactLabelWhenTight[\s\S]*?size="md"/g) || [];
  assert.ok(matches.length >= 2, "MainDashboardClient preview cards must use size='md'");
});

