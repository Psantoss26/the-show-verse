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

// ...Y TAMBIÉN EN LOS ERRORES.
//
// `backendFetchJson` refresca la sesión cuando el token de acceso (15 min) ha
// caducado, y el backend ROTA el refresh token: el anterior solo sigue valiendo
// 60 s. Si la ruta responde a un error del backend sin escribir los tokens
// nuevos, el WebView se queda con el refresh token viejo y, pasada esa gracia,
// la sesión está muerta: cada petición siguiente acaba en "Backend access token
// is not available" aunque la interfaz siga pintando el perfil desde caché. Así
// dejaba de poder vincularse el móvil desde Ajustes.
test("las respuestas de error de backendFetchJson también guardan los tokens rotados", async () => {
  const routeFiles = await findRouteFiles(apiDirectory);
  const offenders = [];

  for (const routeFile of routeFiles) {
    const source = await readFile(routeFile, "utf8");
    if (!source.includes("backendFetchJson(")) continue;
    for (const match of source.matchAll(/\n(\s*)if \(!backend\.ok\) \{\n([\s\S]*?)\n\1\}/g)) {
      const block = match[2];
      if (/\breturn\b/.test(block) && !/setBackendAuthCookies\(|keepTokens\(/.test(block)) {
        offenders.push(path.relative(apiDirectory, routeFile));
      }
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `Estas rutas descartan los tokens rotados al responder un error: ${offenders.join(", ")}`,
  );
});
