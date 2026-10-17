import assert from "node:assert/strict";
import test from "node:test";

import {
  SOUNDTRACK_AUTOPLAY_KEY,
  isSoundtrackAutoplayOn,
  withSoundtrackAutoplay,
} from "./autoplayPreference.js";

test("soundtrack autoplay is off unless explicitly enabled", () => {
  assert.equal(isSoundtrackAutoplayOn(null), false);
  assert.equal(isSoundtrackAutoplayOn({ uiSettings: {} }), false);
  assert.equal(isSoundtrackAutoplayOn({ uiSettings: { [SOUNDTRACK_AUTOPLAY_KEY]: true } }), true);
  assert.equal(isSoundtrackAutoplayOn({ uiSettings: { [SOUNDTRACK_AUTOPLAY_KEY]: false } }), false);
});

test("ignores the legacy key that was saved as true by default", () => {
  assert.equal(isSoundtrackAutoplayOn({ uiSettings: { soundtrackAutoplay: true } }), false);
});

test("sets the preference keeping the other ui settings", () => {
  assert.deepEqual(withSoundtrackAutoplay({ mobileCardsPerRow: 3 }, true), {
    mobileCardsPerRow: 3,
    [SOUNDTRACK_AUTOPLAY_KEY]: true,
  });
});
