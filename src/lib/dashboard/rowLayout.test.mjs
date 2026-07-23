import assert from "node:assert/strict";
import test from "node:test";

import { shouldUseDashboardBackdropRow } from "./rowLayout.js";

test("mobile dashboard rows always use poster cards", () => {
  for (let rowIndex = 0; rowIndex < 8; rowIndex += 1) {
    assert.equal(
      shouldUseDashboardBackdropRow({ isMobile: true, rowIndex }),
      false,
    );
  }
});

test("desktop keeps poster/backdrop alternation and spotlight posters", () => {
  assert.equal(
    shouldUseDashboardBackdropRow({ isMobile: false, rowIndex: 0 }),
    false,
  );
  assert.equal(
    shouldUseDashboardBackdropRow({ isMobile: false, rowIndex: 1 }),
    true,
  );
  assert.equal(
    shouldUseDashboardBackdropRow({
      isMobile: false,
      rowIndex: 1,
      isSpotlight: true,
    }),
    false,
  );
});
