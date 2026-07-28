import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveScrollRevealProps,
  resolveTopResetRevealProps,
} from "./scrollRevealState.js";

test("dashboard reveal props match during hydration even when the browser is returning through history", () => {
  const server = resolveScrollRevealProps({
    hydrationReady: false,
    reduceMotion: false,
    isBackNav: false,
    hasScrolled: false,
  });
  const firstClientRender = resolveScrollRevealProps({
    hydrationReady: false,
    reduceMotion: true,
    isBackNav: true,
    hasScrolled: false,
  });

  assert.deepEqual(firstClientRender, server);
  assert.deepEqual(server, { initial: "hidden", animate: "hidden" });
});

test("history navigation becomes visible only after hydration", () => {
  assert.deepEqual(
    resolveScrollRevealProps({
      hydrationReady: true,
      reduceMotion: false,
      isBackNav: true,
      hasScrolled: false,
    }),
    { initial: false, animate: "visible" },
  );
});

test("top reset reveal also keeps browser-only preferences out of hydration", () => {
  const server = resolveTopResetRevealProps({
    enabled: true,
    hydrationReady: false,
    reduceMotion: false,
    isBackNav: false,
    hasScrolled: false,
    revealed: false,
  });
  const firstClientRender = resolveTopResetRevealProps({
    enabled: true,
    hydrationReady: false,
    reduceMotion: true,
    isBackNav: true,
    hasScrolled: false,
    revealed: false,
  });

  assert.deepEqual(firstClientRender, server);
  assert.deepEqual(server, { initial: "hidden", animate: "hidden" });
});
