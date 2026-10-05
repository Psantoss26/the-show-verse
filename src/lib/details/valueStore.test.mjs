import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createValueStore } from "./valueStore.js";

test("notifies subscribers only when the value actually changes", () => {
  const store = createValueStore("cast");
  let calls = 0;
  const unsubscribe = store.subscribe(() => {
    calls += 1;
  });

  store.set("cast");
  store.set((previous) => previous);
  assert.equal(calls, 0);

  store.set("media");
  assert.equal(store.get(), "media");
  assert.equal(calls, 1);

  unsubscribe();
  store.set("recs");
  assert.equal(calls, 1);
});

// El scroll-spy cambia la sección activa MIENTRAS el usuario arrastra. Como
// estado de DetailsClient re-renderizaba la ficha entera en mitad del gesto y
// el desplazamiento iba a tirones al cruzar las pestañas de detalles.
test("DetailsClient keeps scroll-driven section state out of its own state", async () => {
  const source = await readFile(new URL("../../components/DetailsClient.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /useState\([^)]*"activeSectionId"/);
  assert.match(source, /createValueStore\(restoredValue\(backSnapshot, "activeSectionId"/);
  assert.match(source, /useSyncExternalStore\(store\.subscribe, store\.get, store\.get\)/);
  // `menuCompact` no lo pintaba nadie y su centinela, justo bajo las pestañas,
  // re-renderizaba la ficha al cruzarlo.
  assert.doesNotMatch(source, /setMenuCompact|sentinelRef/);
});
