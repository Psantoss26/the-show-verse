import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));

test("community-list detail forwards the viewer session for liked state", async () => {
  const source = await readFile(path.join(directory, "route.js"), "utf8");

  assert.match(source, /backendFetchPublicJson\(\s*request,/);
  assert.match(source, /setBackendAuthCookies\(response, backend,/);
  assert.match(source, /secure:\s*getCookieSecure\(request\)/);
});
