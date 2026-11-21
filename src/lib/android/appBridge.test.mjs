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

test("status bar mode: only selectable with an app that knows it", async () => {
  const { canChooseStatusBarMode, readStatusBarVisible, setStatusBarVisible } = await import("./appBridge.js");
  const previousWindow = globalThis.window;
  try {
    globalThis.window = undefined;
    assert.equal(canChooseStatusBarMode(), false, "outside the app there is nothing to choose");
    assert.equal(readStatusBarVisible(), false);
    assert.equal(setStatusBarVisible(true), false);

    // APK anterior: oculta la barra y no tiene los métodos.
    globalThis.window = { TSVAndroidBridge: { isApp: () => true, cameraCenterY: () => 30 } };
    assert.equal(canChooseStatusBarMode(), false);
    assert.equal(readStatusBarVisible(), false);
    assert.equal(setStatusBarVisible(true), false);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("status bar mode: reads and writes the native preference", async () => {
  const { canChooseStatusBarMode, readStatusBarVisible, setStatusBarVisible } = await import("./appBridge.js");
  const previousWindow = globalThis.window;
  let visible = false;
  globalThis.window = {
    TSVAndroidBridge: {
      isApp: () => true,
      statusBarVisible: () => visible,
      setStatusBarVisible: (value) => {
        visible = value;
        return true;
      },
    },
  };
  try {
    assert.equal(canChooseStatusBarMode(), true);
    assert.equal(readStatusBarVisible(), false, "mode 1 (hidden) is the default");
    assert.equal(setStatusBarVisible(true), true);
    assert.equal(visible, true);
    assert.equal(readStatusBarVisible(), true);
    assert.equal(setStatusBarVisible(0), true);
    assert.equal(visible, false, "the value reaches the app as a boolean");
  } finally {
    globalThis.window = previousWindow;
  }
});
