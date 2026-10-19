import test from "node:test";
import assert from "node:assert/strict";

import { mergeRewatchRuns } from "./mergeRewatchRuns.js";

const FIRST = "2025-06-12T18:00:00.000Z";
const REWATCH = "2026-10-18T21:30:00.000Z";

test("un rewatch nuevo del servidor no se funde con el run anterior ya guardado", () => {
  const stored = [{ id: FIRST, startedAt: FIRST, completed: true, progressCount: 62 }];
  const incoming = [
    { id: REWATCH, startedAt: REWATCH, completed: false, progressCount: 1 },
    { id: FIRST, startedAt: FIRST, completed: true, progressCount: 62 },
  ];

  const merged = mergeRewatchRuns(stored, incoming);

  assert.deepEqual(merged.map((r) => r.id), [REWATCH, FIRST]);
  assert.equal(merged[0].progressCount, 1);
  assert.equal(merged[1].completed, true);
  assert.equal(merged[1].progressCount, 62);
});

test("se recupera un run anterior que ya había absorbido el rewatch por error", () => {
  const stored = [{ id: FIRST, startedAt: FIRST, completed: false, progressCount: 1 }];
  const incoming = [
    { id: FIRST, startedAt: FIRST, completed: true, progressCount: 62 },
    { id: REWATCH, startedAt: REWATCH, completed: false, progressCount: 1 },
  ];

  const merged = mergeRewatchRuns(stored, incoming);

  assert.deepEqual(merged.map((r) => r.id), [REWATCH, FIRST]);
  assert.equal(merged[1].completed, true);
});

test("un rewatch creado a mano absorbe el primer run del servidor que empieza después", () => {
  const manual = "2026-10-18T20:00:00.000Z";
  const stored = [
    { id: manual, startedAt: manual, label: "Mi rewatch" },
    { id: FIRST, startedAt: FIRST },
  ];
  const incoming = [
    { id: FIRST, startedAt: FIRST, completed: true },
    { id: REWATCH, startedAt: REWATCH, completed: false, progressCount: 3 },
  ];

  const merged = mergeRewatchRuns(stored, incoming);

  assert.deepEqual(merged.map((r) => r.id), [manual, FIRST]);
  assert.equal(merged[0].label, "Mi rewatch");
  assert.equal(merged[0].progressCount, 3);
});

test("el run manual absorbe solo uno; el rewatch siguiente aparece aparte", () => {
  const manual = "2026-01-01T00:00:00.000Z";
  const secondLayer = "2026-01-02T00:00:00.000Z";
  const stored = [
    { id: manual, startedAt: manual },
    { id: FIRST, startedAt: FIRST },
  ];
  const incoming = [
    { id: FIRST, startedAt: FIRST },
    { id: secondLayer, startedAt: secondLayer, completed: true },
    { id: REWATCH, startedAt: REWATCH, completed: false },
  ];

  const merged = mergeRewatchRuns(stored, incoming);

  assert.deepEqual(merged.map((r) => r.id), [REWATCH, manual, FIRST]);
  assert.equal(merged[1].completed, true);
});
