import assert from "node:assert/strict";
import test from "node:test";

import {
  hasNativeGoogleSignInInFlight,
  requestNativeGoogleIdToken,
} from "./appBridge.js";

test("clears the native inbox after receiving the direct Google callback", async () => {
  const previousWindow = globalThis.window;
  let requestId = "";
  let inboxReads = 0;

  globalThis.window = {
    TSVAndroidBridge: {
      isApp: () => true,
      canSignInWithGoogle: () => true,
      signInWithGoogle: (id) => {
        requestId = id;
        return true;
      },
      takeGoogleSignInResult: () => {
        inboxReads += 1;
        return JSON.stringify({ ok: true, idToken: "google-id-token" });
      },
    },
    clearInterval: () => {},
    setInterval: () => 1,
  };

  try {
    const pending = requestNativeGoogleIdToken();
    assert.equal(hasNativeGoogleSignInInFlight(), true);
    globalThis.window.__tsvGoogleSignInResult(
      requestId,
      JSON.stringify({ ok: true, idToken: "google-id-token" }),
    );

    assert.deepEqual(await pending, { ok: true, idToken: "google-id-token" });
    assert.equal(hasNativeGoogleSignInInFlight(), false);
    assert.equal(
      inboxReads,
      1,
      "the direct callback must consume its stored native result so the global recovery cannot exchange it again",
    );
  } finally {
    globalThis.window = previousWindow;
  }
});
