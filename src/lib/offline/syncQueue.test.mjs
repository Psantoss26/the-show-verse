import assert from "node:assert/strict";
import test from "node:test";

import { offlineMutationFetch } from "./syncQueue.js";

test("una mutación devuelve el error real del servidor y no se transforma en sincronización pendiente", async () => {
  const previousFetch = globalThis.fetch;
  const previousWindow = globalThis.window;
  const storage = new Map();

  globalThis.window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
  };
  globalThis.fetch = async () => new Response("backend unavailable", { status: 503 });

  try {
    const response = await offlineMutationFetch("/api/trakt/ratings", { method: "POST" });
    assert.equal(response.status, 503);
    assert.equal(storage.get("showverse:offline:mutationQueue:v1"), undefined);
  } finally {
    globalThis.fetch = previousFetch;
    globalThis.window = previousWindow;
  }
});
