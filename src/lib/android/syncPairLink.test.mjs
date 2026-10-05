import assert from "node:assert/strict";
import test from "node:test";

import { SYNC_APP_PACKAGE, buildSyncPairLinks } from "./syncPairLink.js";

test("el enlace de apertura va dirigido a The Show Verse Sync", () => {
  const { open } = buildSyncPairLinks("tsv_netflix_abc", "https://theshowverse.com");
  assert.equal(
    open,
    "intent://pair?token=tsv_netflix_abc&origin=https%3A%2F%2Ftheshowverse.com" +
      `#Intent;scheme=theshowverse;package=${SYNC_APP_PACKAGE};end`,
  );
});

test("el enlace para copiar es el esquema propio, que vale en cualquier versión", () => {
  const { copy } = buildSyncPairLinks("a b", "http://192.168.1.5:3000");
  assert.equal(copy, "theshowverse://pair?token=a%20b&origin=http%3A%2F%2F192.168.1.5%3A3000");
});
