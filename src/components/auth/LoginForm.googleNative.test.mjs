import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const loginForm = path.join(directory, "LoginForm.jsx");

test("native Google login redirects without waiting for auth hydration", async () => {
  const source = await readFile(loginForm, "utf8");

  assert.doesNotMatch(
    source,
    /await refreshMe\?\.\(\)/,
    "a stalled /api/auth/me request must not keep Android users on the login screen after cookies are installed",
  );
  assert.match(source, /window\.location\.replace\(sanitizeNextPath\(destino \|\| next\)\)/);
});
