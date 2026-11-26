import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const loginForm = path.join(directory, "LoginForm.jsx");

test("Android tries the native account picker first and falls back to the browser", async () => {
  const source = await readFile(loginForm, "utf8");

  assert.match(source, /await requestNativeGoogleIdToken\(\)/);
  assert.match(source, /appGoogleNextStep\(resultado\)/);
  // Cerrar el selector no abre el navegador; un fallo real, sí.
  assert.match(source, /if \(paso === "stay"\) \{/);
  assert.match(source, /abrirLoginEnNavegador\(\);/);
});

test("a second tap after a 'cancelled' picker skips it and opens the browser", async () => {
  const source = await readFile(loginForm, "utf8");

  assert.match(source, /nativoCanceladoRef\.current = true;/);
  assert.match(source, /appGoogleShouldTryNative\(\{ cancelledBefore: nativoCanceladoRef\.current \}\)/);
});

test("the web uses Google's official button with the redirect as a fallback", async () => {
  const source = await readFile(loginForm, "utf8");

  assert.match(source, /<GoogleSignInButton/);
  assert.match(source, /onCredential=\{entrarConIdToken\}/);
  assert.match(source, /fallbackHref=\{googleAuthHref\}/);
});
