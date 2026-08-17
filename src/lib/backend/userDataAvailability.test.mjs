import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  DEGRADED_USER_DATA_STATUS,
  degradedUserDataResponse,
  shouldReportBackendDegraded,
} from "./userDataAvailability.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const apiDirectory = path.resolve(currentDirectory, "../../app/api");

test("una sesión propia cuyo backend falló NO se reporta como desconectada", () => {
  assert.equal(
    shouldReportBackendDegraded({
      hadBackendCredentials: true,
      backendFailed: true,
      hasTraktTokens: false,
    }),
    true,
  );
});

test("si el backend respondió bien no hay nada degradado que reportar", () => {
  assert.equal(
    shouldReportBackendDegraded({
      hadBackendCredentials: true,
      backendFailed: false,
      hasTraktTokens: false,
    }),
    false,
  );
});

test("un usuario SOLO de Trakt sigue recibiendo el veredicto de siempre", () => {
  assert.equal(
    shouldReportBackendDegraded({
      hadBackendCredentials: false,
      backendFailed: false,
      hasTraktTokens: false,
    }),
    false,
  );
});

test("con tokens de Trakt se deja correr el camino de Trakt (puede traer datos reales)", () => {
  assert.equal(
    shouldReportBackendDegraded({
      hadBackendCredentials: true,
      backendFailed: true,
      hasTraktTokens: true,
    }),
    false,
  );
});

test("la respuesta degradada dice 'conectado' y usa un estado de no disponible", async () => {
  const res = degradedUserDataResponse({ items: [], stats: null });
  assert.equal(res.status, DEGRADED_USER_DATA_STATUS);
  // El cliente lo lee con `isUnavailableStatus` (>=500 o 429): conserva caché y
  // NO desconecta.
  assert.ok(res.status >= 500);
  assert.deepEqual(await res.json(), {
    connected: true,
    degraded: true,
    items: [],
    stats: null,
  });
});

// GUARDA ESTRUCTURAL, igual que sessionCookiePropagation.test.mjs.
//
// Las rutas de datos de las páginas de usuario intentan primero el backend
// propio y, si falla, CAEN al camino heredado de Trakt. Quien no tiene cuenta de
// Trakt acababa recibiendo `connected: false`, que el cliente pinta como
// "Inicia sesión" / lista vacía y que además le BORRA la caché: un fallo
// pasajero del backend (rate limit, 5xx, timeout) dejaba la página en blanco con
// la sesión perfectamente válida. Si una ruta cae a Trakt, tiene que saber
// distinguir «no hay sesión» de «no he podido comprobarlo».
const LEGACY_FALLBACK_ROUTES = [
  "trakt/show/in-progress/route.js",
  "trakt/show/completed/route.js",
  "trakt/history/route.js",
];

test("toda ruta que cae de backend a Trakt distingue 'no he podido comprobarlo'", async () => {
  const offenders = [];

  for (const relative of LEGACY_FALLBACK_ROUTES) {
    const source = await readFile(path.join(apiDirectory, relative), "utf8");
    if (!source.includes("degradedUserDataResponse(")) {
      offenders.push(relative);
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `Estas rutas siguen convirtiendo un fallo del backend en "desconectado": ${offenders.join(", ")}`,
  );
});

test("la lista de rutas con caída a Trakt sigue completa", async () => {
  // Si aparece una ruta nueva que hace el mismo baile (backend → Trakt), hay que
  // añadirla arriba para que la guarda la cubra.
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

  const routeFiles = await findRouteFiles(apiDirectory);
  const missing = [];

  for (const routeFile of routeFiles) {
    const relative = path.relative(apiDirectory, routeFile);
    if (LEGACY_FALLBACK_ROUTES.includes(relative)) continue;
    const source = await readFile(routeFile, "utf8");
    // El patrón exacto: se pide crédito al backend propio Y se responde
    // "desconectado" con una lista de items (las páginas de usuario).
    if (
      source.includes("hasBackendCredentials(request)") &&
      /connected:\s*false,\s*items:/.test(source)
    ) {
      missing.push(relative);
    }
  }

  assert.deepEqual(
    missing.sort(),
    [],
    `Rutas con el mismo patrón sin cubrir por la guarda: ${missing.join(", ")}`,
  );
});
