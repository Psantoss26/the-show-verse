import assert from "node:assert/strict";
import test from "node:test";
import { resolveHeroSoundtrackVolume } from "./heroSoundtrack.js";

test("mobile and tablet use 50% even when saved volume is zero or nearly silent", () => {
  for (const saved of [0, 0.001, 0.01, 0.3, 0.8, 1, NaN, Infinity]) {
    assert.equal(resolveHeroSoundtrackVolume(saved, false), 0.5);
  }
});

test("desktop retains the volume chosen with its visible controls", () => {
  for (const saved of [0, 0.01, 0.3, 0.8, 1]) {
    assert.equal(resolveHeroSoundtrackVolume(saved, true), saved);
  }
});

test("changing layout does not overwrite the saved desktop preference", () => {
  const saved = 0.01;
  assert.equal(resolveHeroSoundtrackVolume(saved, true), 0.01);
  assert.equal(resolveHeroSoundtrackVolume(saved, false), 0.5);
  assert.equal(resolveHeroSoundtrackVolume(saved, true), 0.01);
});

test("invalid desktop preferences cannot produce an invalid media volume", () => {
  assert.equal(resolveHeroSoundtrackVolume(NaN, true), 0.3);
  assert.equal(resolveHeroSoundtrackVolume(Infinity, true), 0.3);
  assert.equal(resolveHeroSoundtrackVolume(-1, true), 0);
  assert.equal(resolveHeroSoundtrackVolume(2, true), 1);
});
