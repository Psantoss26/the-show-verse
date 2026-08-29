import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getHorizontalSwipeDirection } from "./useHorizontalSwipe.js";

const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("clasifica solo deslizamientos horizontales breves y suficientes", () => {
  assert.equal(
    getHorizontalSwipeDirection({
      startX: 300,
      startY: 200,
      startTime: 0,
      endX: 120,
      endY: 210,
      endTime: 250,
    }),
    "left",
  );
  assert.equal(
    getHorizontalSwipeDirection({
      startX: 120,
      startY: 200,
      startTime: 0,
      endX: 300,
      endY: 210,
      endTime: 250,
    }),
    "right",
  );
  assert.equal(
    getHorizontalSwipeDirection({
      startX: 300,
      startY: 200,
      startTime: 0,
      endX: 280,
      endY: 200,
      endTime: 100,
    }),
    null,
  );
  assert.equal(
    getHorizontalSwipeDirection({
      startX: 300,
      startY: 200,
      startTime: 0,
      endX: 120,
      endY: 350,
      endTime: 250,
    }),
    null,
  );
});

test("las pestañas móviles usan la misma captura táctil fiable que Perfil", async () => {
  const [swipeHook, infoTabs, detailsClient, seasonDetails, episodeDetails] = await Promise.all([
    readSource("./useHorizontalSwipe.js"),
    readSource("../components/details/DetailsInfoTabs.jsx"),
    readSource("../components/DetailsClient.jsx"),
    readSource("../components/SeasonDetailsClient.jsx"),
    readSource("../components/EpisodeDetailsClient.jsx"),
  ]);

  assert.match(swipeHook, /onTouchStartCapture/);
  assert.match(swipeHook, /onTouchEndCapture/);
  assert.match(swipeHook, /onTouchCancelCapture/);
  assert.match(swipeHook, /onClickCapture/);
  assert.match(swipeHook, /event\.stopPropagation\(\)/);
  assert.match(swipeHook, /shouldStart && !shouldStart\(event\)/);

  assert.match(
    infoTabs,
    /ÁREA DE CONTENIDO DE TABS[\s\S]*?<div\s+\{\.\.\.swipeHandlers\}\s+className="relative min-h-\[100px\] touch-pan-y sm:touch-auto"/,
  );

  assert.match(detailsClient, /<DetailsInfoTabs[\s\S]*?mobileLayout[\s\S]*?enableMobileTabSwipe/);
  assert.match(seasonDetails, /<DetailsInfoTabs[\s\S]*?enableMobileTabSwipe/);
  assert.match(episodeDetails, /<DetailsInfoTabs[\s\S]*?enableMobileTabSwipe/);
});
