import assert from "node:assert/strict";
import test from "node:test";

import { androidBrowserIntentUrl, isAndroidBrowser } from "./browserOnlyLink.js";

test("en Android se pide la página a Chrome con la URL normal de respaldo", () => {
  assert.equal(
    androidBrowserIntentUrl("https://letterboxd.com/data/export"),
    "intent://letterboxd.com/data/export#Intent;scheme=https;action=android.intent.action.VIEW;" +
      "category=android.intent.category.BROWSABLE;package=com.android.chrome;" +
      "S.browser_fallback_url=https%3A%2F%2Fletterboxd.com%2Fdata%2Fexport;end",
  );
  assert.match(androidBrowserIntentUrl("https://a.com/x?y=1"), /^intent:\/\/a\.com\/x\?y=1#Intent;/);
  // Lo que no es https se deja tal cual.
  assert.equal(androidBrowserIntentUrl("http://a.com"), "http://a.com");
  assert.equal(androidBrowserIntentUrl("nope"), "nope");
});

test("detecta los navegadores de Android", () => {
  assert.equal(isAndroidBrowser("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130 Mobile"), true);
  assert.equal(isAndroidBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"), false);
  assert.equal(isAndroidBrowser("Mozilla/5.0 (X11; Linux x86_64) Chrome/130"), false);
});
