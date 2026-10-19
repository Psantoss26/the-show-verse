import assert from "node:assert/strict";
import test from "node:test";

import {
  episodeRangesParam,
  episodeWindowChunks,
  getTrackedEpisodesByWindow,
  mapEpisodeRanges,
  mergeEpisodeChunks,
} from "./calendar.js";

const ymdOf = ([date, days]) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}:${days}`;

test("la ventana de un año se parte en trozos de 62 días como mucho", () => {
  const chunks = episodeWindowChunks(
    new Date(2026, 9, 1),
    new Date(2027, 8, 30, 23, 59, 59, 999),
  );
  assert.equal(chunks.length, 6);
  assert.ok(chunks.every(([, days]) => days >= 1 && days <= 62));
  assert.equal(ymdOf(chunks[0]), "2026-10-01:62");
});

test("el parámetro ranges lleva cada trozo como AAAA-MM-DD:días", () => {
  const param = episodeRangesParam([
    [new Date(2026, 9, 1), 62],
    [new Date(2026, 11, 2), 30],
  ]);
  assert.equal(param, "2026-10-01:62,2026-12-02:30");
});

test("la respuesta por lotes solo vale si trae un rango por trozo pedido", () => {
  const json = {
    ranges: [
      { items: [{ id: "a", show: { tmdbId: 1 }, episode: { airDate: "2026-10-02" } }] },
      { items: [] },
    ],
  };
  const lists = mapEpisodeRanges(json, 2);
  assert.equal(lists.length, 2);
  assert.equal(lists[0].items[0].first_aired, "2026-10-02");
  assert.equal(mapEpisodeRanges(json, 3), null);
  // Backend anterior (sin `ranges`): responde `{ items }`.
  assert.equal(mapEpisodeRanges({ items: [] }, 2), null);
});

test("los trozos se juntan sin repetir episodios", () => {
  const merged = mergeEpisodeChunks([
    { items: [{ id: "x" }, { id: "y" }] },
    { items: [{ id: "y" }, { id: "z" }] },
  ]);
  assert.deepEqual(merged.items.map((item) => item.id), ["x", "y", "z"]);
});

test("con el lote pide una sola vez y, si no lo hay, cae a los trozos uno a uno", async () => {
  const start = new Date(2026, 9, 1);
  const end = new Date(2027, 8, 30, 23, 59, 59, 999);
  let single = 0;
  const fetchRange = async () => {
    single += 1;
    return { items: [{ id: `s${single}` }] };
  };

  const batched = await getTrackedEpisodesByWindow(start, end, {
    fetchRanges: async (chunks) => chunks.map((_, i) => ({ items: [{ id: `b${i}` }] })),
    fetchRange,
  });
  assert.equal(single, 0);
  assert.equal(batched.items.length, 6);

  const fallback = await getTrackedEpisodesByWindow(start, end, {
    fetchRanges: async () => null,
    fetchRange,
  });
  assert.equal(single, 6);
  assert.equal(fallback.items.length, 6);
});
