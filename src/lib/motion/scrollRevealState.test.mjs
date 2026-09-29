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

test("top reset reveal stays hidden when returning through history with the scroll at the top", () => {
  // En móvil la primera sección asoma bajo la navbar inferior: al volver a un
  // dashboard con el scroll arriba debe seguir oculta, sin animación.
  assert.deepEqual(
    resolveTopResetRevealProps({
      enabled: true,
      hydrationReady: true,
      reduceMotion: false,
      isBackNav: true,
      hasScrolled: false,
      revealed: false,
    }),
    { initial: false, animate: "hidden" },
  );
});

test("top reset reveal appears without animation when history restores a scrolled position", () => {
  assert.deepEqual(
    resolveTopResetRevealProps({
      enabled: true,
      hydrationReady: true,
      reduceMotion: false,
      isBackNav: true,
      hasScrolled: true,
      revealed: false,
    }),
    { initial: false, animate: "visible" },
  );
});
