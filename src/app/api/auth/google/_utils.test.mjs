import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAndroidHandoffPage,
  buildAndroidOauthHandoffUrl,
  createOauthState,
  exchangeGoogleCode,
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
  assert.match(html, /location\.replace\("theshowverse:/);
});

test("the popup code is exchanged with redirect_uri=postmessage and the client secret", async () => {
  const previous = {
    id: process.env.GOOGLE_CLIENT_ID,
    secret: process.env.GOOGLE_CLIENT_SECRET,
    fetch: globalThis.fetch,
  };
  process.env.GOOGLE_CLIENT_ID = "client-id";
  process.env.GOOGLE_CLIENT_SECRET = "client-secret";
  let sent = null;
  globalThis.fetch = async (url, init) => {
    sent = { url, body: new URLSearchParams(init.body) };
    return new Response(JSON.stringify({ id_token: "token" }), { status: 200 });
  };
  try {
    const result = await exchangeGoogleCode("the-code", "postmessage");
    assert.equal(result.ok, true);
    assert.equal(result.json.id_token, "token");
    assert.equal(sent.url, "https://oauth2.googleapis.com/token");
    assert.equal(sent.body.get("code"), "the-code");
    assert.equal(sent.body.get("redirect_uri"), "postmessage");
    assert.equal(sent.body.get("client_secret"), "client-secret");
    assert.equal(sent.body.get("grant_type"), "authorization_code");
  } finally {
    process.env.GOOGLE_CLIENT_ID = previous.id;
    process.env.GOOGLE_CLIENT_SECRET = previous.secret;
    if (previous.id === undefined) delete process.env.GOOGLE_CLIENT_ID;
    if (previous.secret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
    globalThis.fetch = previous.fetch;
  }
});
