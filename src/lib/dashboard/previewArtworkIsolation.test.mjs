import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const detailsClientPath = new URL(
  "../../components/DetailsClient.jsx",
  import.meta.url,
);
const detailModalDataPath = new URL(
  "../../components/dashboard/useDetailModalData.js",
  import.meta.url,
);
const dashboardCardPaths = [
  new URL("../../components/MainDashboardClient.jsx", import.meta.url),
  new URL(
    "../../components/dashboard/DashboardBackdropRow.jsx",
    import.meta.url,
  ),
  new URL("../../components/ContinueWatchingSection.jsx", import.meta.url),
  new URL("../../components/FeaturedHero.jsx", import.meta.url),
  new URL("../../app/movies/MoviesPageClient.jsx", import.meta.url),
  new URL("../../app/series/SeriesPageClient.jsx", import.meta.url),
];

test("la vista previa de backdrop se conserva para DetailModal", async () => {
  const [detailsClient, detailModalData] = await Promise.all([
    readFile(detailsClientPath, "utf8"),
    readFile(detailModalDataPath, "utf8"),
  ]);

  assert.match(detailsClient, /kind: "backdrop", filePath/);
  assert.match(detailModalData, /backdropOverride = artworkPreference\.backdrop/);
});

test("las tarjetas no leen el backdrop seleccionado para la vista previa", async () => {
  const sources = await Promise.all(
    dashboardCardPaths.map((path) => readFile(path, "utf8")),
  );

  sources.forEach((source) => {
    assert.doesNotMatch(source, /\{\s*backdrop:\s*userBackdrop\s*\}/);
    assert.doesNotMatch(source, /userPreferredBackdrop/);
  });
});

test("el dashboard no sincroniza overrides remotos de tipo backdrop", async () => {
  const dashboard = await readFile(dashboardCardPaths[0], "utf8");

  assert.doesNotMatch(dashboard, /kind:\s*"backdrop"/);
  assert.match(dashboard, /const backdropOverrides = EMPTY_OBJECT/);
});
