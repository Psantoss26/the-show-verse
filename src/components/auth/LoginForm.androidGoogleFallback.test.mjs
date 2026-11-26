import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const loginForm = path.join(directory, "LoginForm.jsx");

test("Android goes straight to the browser login, never the native picker", async () => {
  const source = await readFile(loginForm, "utf8");

  assert.doesNotMatch(source, /requestNativeGoogleIdToken/);
  const handler = source.slice(source.indexOf("const handleAppGoogleLogin"));
  assert.match(handler.slice(0, 400), /abrirLoginEnNavegador\(\);/);
});

test("the web uses Google's official button with the redirect as a fallback", async () => {
  const source = await readFile(loginForm, "utf8");

  assert.match(source, /<GoogleSignInButton/);
  assert.match(source, /onCredential=\{entrarConIdToken\}/);
  assert.match(source, /fallbackHref=\{googleAuthHref\}/);
});
