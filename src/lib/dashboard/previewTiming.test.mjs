import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DASHBOARD_PREVIEW_CLOSE_DELAY_MS,
  DASHBOARD_PREVIEW_ENTER_TRANSITION,
  DASHBOARD_PREVIEW_EXIT_TRANSITION,
  DASHBOARD_PREVIEW_OPEN_DELAY_MS,
} from "./previewTiming.js";

const dashboardPreviewSources = [
  new URL("../../components/MainDashboardClient.jsx", import.meta.url),
  new URL("../../components/ContinueWatchingSection.jsx", import.meta.url),
  new URL(
    "../../components/dashboard/DashboardBackdropRow.jsx",
    import.meta.url,
  ),
  new URL("../../app/movies/MoviesPageClient.jsx", import.meta.url),
  new URL("../../app/series/SeriesPageClient.jsx", import.meta.url),
];

test("dashboard previews wait for intentional hover without feeling sluggish", () => {
  assert.ok(DASHBOARD_PREVIEW_OPEN_DELAY_MS >= 200);
  assert.ok(DASHBOARD_PREVIEW_OPEN_DELAY_MS <= 300);
  assert.ok(DASHBOARD_PREVIEW_CLOSE_DELAY_MS >= DASHBOARD_PREVIEW_OPEN_DELAY_MS);
});

test("preview entry and exit keep a fluid but responsive motion contract", () => {
  assert.ok(DASHBOARD_PREVIEW_ENTER_TRANSITION.duration >= 0.3);
  assert.ok(DASHBOARD_PREVIEW_EXIT_TRANSITION.duration >= 0.2);
  assert.ok(
    DASHBOARD_PREVIEW_EXIT_TRANSITION.duration <
      DASHBOARD_PREVIEW_ENTER_TRANSITION.duration,
  );
});

test("every expandable dashboard row uses the shared hover delay", async () => {
  const sources = await Promise.all(
    dashboardPreviewSources.map((source) => readFile(source, "utf8")),
  );

  sources.forEach((source) => {
    assert.match(source, /DASHBOARD_PREVIEW_OPEN_DELAY_MS/);
    assert.match(source, /DASHBOARD_PREVIEW_ENTER_TRANSITION/);
    assert.match(source, /DASHBOARD_PREVIEW_EXIT_TRANSITION/);
  });
});
