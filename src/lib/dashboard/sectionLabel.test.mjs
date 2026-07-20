import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveSectionLabel,
  normalizeDashboardSectionTitle,
} from "./sectionLabel.js";

test("normalizes legacy decade dashboard titles", () => {
  assert.equal(
    normalizeDashboardSectionTitle("Lo mejor de los 1980"),
    "Lo mejor de 1980",
  );
  assert.equal(
    normalizeDashboardSectionTitle("Lo mejor de los 1990"),
    "Lo mejor de 1990",
  );
});

test("formats decade dashboard labels as full decade names", () => {
  assert.equal(deriveSectionLabel("Lo mejor de 1980"), "DÉCADA 1980");
  assert.equal(deriveSectionLabel("Lo mejor de 1990"), "DÉCADA 1990");
  assert.equal(deriveSectionLabel("Lo mejor de 2010"), "DÉCADA 2010");
  assert.equal(deriveSectionLabel("Lo mejor de 2020"), "DÉCADA 2020");
});

test("keeps legacy decade dashboard titles readable while caches expire", () => {
  assert.equal(deriveSectionLabel("Lo mejor de los 1990"), "DÉCADA 1990");
  assert.equal(deriveSectionLabel("Clásicos de los 90"), "DÉCADA 1990");
});
