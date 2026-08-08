import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAndroidHandoffPage,
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

test("the return page carries the deep link and cannot break out of the markup", () => {
  const enlace =
    'theshowverse://open?url=https://theshowverse.com/cb?code=a&state=b"><script>x()</script>';
  const html = buildAndroidHandoffPage(enlace);

  // El botón es lo que garantiza la vuelta cuando el navegador bloquea el salto
  // automático: pulsarlo es un gesto del usuario.
  assert.match(html, /<a class="boton" id="volver" href="theshowverse:/);

  // Ni las comillas ni el `<` del enlace pueden cerrar el atributo ni inyectar
  // etiquetas: van escapados.
  assert.equal(html.includes('&quot;&gt;&lt;script&gt;'), true);
  assert.equal(html.includes('"><script>x()</script>'), false);

  // Y el salto automático viaja como literal JS válido.
  assert.match(html, /window\.location\.replace\("theshowverse:/);
});
