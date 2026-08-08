import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const loginForm = path.join(directory, "LoginForm.jsx");

test("Android starts Google OAuth through the browser handoff instead of the native token flow", async () => {
  const source = await readFile(loginForm, "utf8");

  assert.doesNotMatch(
    source,
    /const resultado = await signInWithGoogleNative\(\)/,
    "the APK must not depend on a Credential Manager token that requires a separately configured Android OAuth certificate",
  );
  assert.match(source, /if \(!inAndroidApp\) return;/);
  assert.match(source, /abrirLoginEnNavegador\(\);/);
});
