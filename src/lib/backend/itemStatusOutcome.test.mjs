import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyBackendItemStatus,
  ITEM_STATUS_OUTCOME,
} from "./itemStatusOutcome.js";

test("una respuesta correcta del backend manda", () => {
  assert.equal(
    classifyBackendItemStatus({ ok: true, status: 200 }),
    ITEM_STATUS_OUTCOME.RESUELTO,
  );
});

test("un 404 es autoritativo: el título no está en sus listas", () => {
  assert.equal(
    classifyBackendItemStatus({ ok: false, skipped: false, status: 404 }),
    ITEM_STATUS_OUTCOME.RESUELTO,
  );
});

test("sin sesión utilizable no hay estado que dar, y NO es un fallo", () => {
  // Es lo que devuelve backendFetchJson cuando ya intentó refrescar y no
  // consiguió access token. Devolvía un 503 en cada ficha, en bucle.
  assert.equal(
    classifyBackendItemStatus({
      ok: false,
      skipped: true,
      status: 401,
      error: "Backend access token is not available",
    }),
    ITEM_STATUS_OUTCOME.SIN_SESION,
  );
});

test("una caída real del backend sí deja el estado sin resolver", () => {
  for (const status of [500, 502, 503, 504]) {
    assert.equal(
      classifyBackendItemStatus({ ok: false, skipped: false, status }),
      ITEM_STATUS_OUTCOME.NO_CONCLUYENTE,
      `HTTP ${status} debería ser no concluyente`,
    );
  }
});

test("un 401 del propio backend tampoco deja nada por saber", () => {
  // La petición SÍ se hizo y el backend rechazó el token. No es una carrera con
  // la rotación: `backendFetchJson` ya reintenta con un token nuevo antes de
  // devolver esto. Es el caso que se veía en el navegador con un
  // `showverse_access_token` viejo y sin cookie de refresco.
  assert.equal(
    classifyBackendItemStatus({ ok: false, skipped: false, status: 401 }),
    ITEM_STATUS_OUTCOME.SIN_SESION,
  );
});

test("sin backend configurado tampoco se sabe nada", () => {
  assert.equal(
    classifyBackendItemStatus({
      ok: false,
      skipped: true,
      status: 0,
      error: "Backend base URL is not configured",
    }),
    ITEM_STATUS_OUTCOME.NO_CONCLUYENTE,
  );
});
