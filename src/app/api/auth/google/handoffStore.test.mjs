import assert from "node:assert/strict";
import test from "node:test";

import {
  abrirEntrega,
  asociarEstado,
  buscarPorEstado,
  completarEntrega,
  reclamarEntrega,
  __vaciar,
} from "./handoffStore.js";

test("the browser hands the session over to the app", () => {
  __vaciar();
  abrirEntrega("app-1", { next: "/social" });
  asociarEstado("app-1", "android.abc");

  // El navegador valida el state contra la entrega, no contra una cookie: es
  // que no comparte almacén con el WebView.
  const encontrada = buscarPorEstado("android.abc");
  assert.equal(encontrada.appId, "app-1");
  assert.equal(buscarPorEstado("android.otro"), null);

  assert.equal(reclamarEntrega("app-1").estado, "pendiente");

  completarEntrega("app-1", { accessToken: "a", refreshToken: "r" });
  const recogida = reclamarEntrega("app-1");
  assert.equal(recogida.estado, "lista");
  assert.equal(recogida.tokens.accessToken, "a");
  assert.equal(recogida.next, "/social");

  // De un solo uso: un identificador filtrado no sirve dos veces.
  assert.equal(reclamarEntrega("app-1").estado, "desconocida");
});

test("expired deliveries are neither found nor claimed", () => {
  __vaciar();
  const t0 = 1_000_000;
  abrirEntrega("app-2", { next: "/", ahora: t0 });
  asociarEstado("app-2", "android.xyz", { ahora: t0 });
  completarEntrega("app-2", { accessToken: "a" }, { ahora: t0 });

  const tarde = t0 + 11 * 60 * 1000; // el TTL son 10 minutos
  assert.equal(buscarPorEstado("android.xyz", { ahora: tarde }), null);
  assert.equal(reclamarEntrega("app-2", { ahora: tarde }).estado, "desconocida");
});

test("an unknown app id claims nothing", () => {
  __vaciar();
  assert.equal(reclamarEntrega("no-existe").estado, "desconocida");
  assert.equal(completarEntrega("no-existe", { accessToken: "a" }), false);
});
