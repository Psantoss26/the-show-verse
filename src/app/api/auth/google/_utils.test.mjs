import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAndroidOauthHandoffUrl,
  createOauthState,
  isAndroidAppUserAgent,
  isAndroidOauthState,
} from "./_utils.js";

test("marks only OAuth states created by the Android WebView", () => {
  const webState = createOauthState();
  const androidState = createOauthState({ android: true });

  assert.equal(isAndroidOauthState(webState), false);
  assert.equal(isAndroidOauthState(androidState), true);
  assert.equal(isAndroidOauthState("android.not-random-enough"), false);
});

test("recognizes the native shell without matching a regular browser", () => {
  assert.equal(
    isAndroidAppUserAgent("Mozilla/5.0 TheShowVerseApp/1.0"),
    true,
  );
  assert.equal(isAndroidAppUserAgent("Mozilla/5.0 Chrome/140"), false);
});

test("returns the Google callback to the app without changing its public origin", () => {
  const state = createOauthState({ android: true });
  const handoff = buildAndroidOauthHandoffUrl("https://theshowverse.com", {
    code: "google-code",
    state,
  });

  assert.equal(handoff.protocol, "theshowverse:");
  assert.equal(handoff.host, "open");

  const callback = new URL(handoff.searchParams.get("url"));
  assert.equal(callback.origin, "https://theshowverse.com");
  assert.equal(callback.pathname, "/api/auth/google/callback");
  assert.equal(callback.searchParams.get("code"), "google-code");
  assert.equal(callback.searchParams.get("state"), state);
  assert.equal(callback.searchParams.get("app_handoff"), "1");
});
