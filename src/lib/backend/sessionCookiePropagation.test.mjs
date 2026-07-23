import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const apiDirectory = path.resolve(currentDirectory, "../../app/api");

async function findRouteFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return findRouteFiles(target);
      return entry.isFile() && entry.name === "route.js" ? [target] : [];
    }),
  );
  return nested.flat();
}

test("every API route that refreshes backend auth propagates the new cookies", async () => {
  const routeFiles = await findRouteFiles(apiDirectory);
  const offenders = [];

  for (const routeFile of routeFiles) {
    const source = await readFile(routeFile, "utf8");
    if (
      source.includes("backendFetchJson(") &&
      !source.includes("setBackendAuthCookies(")
    ) {
      offenders.push(path.relative(apiDirectory, routeFile));
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `Routes that can rotate auth must call setBackendAuthCookies: ${offenders.join(", ")}`,
  );
});
