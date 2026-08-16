import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { REFRESH_ROTATION_GRACE_MS } from "../../../backend/src/lib/refreshRotation.js";

const AUTH_CONTEXT = new URL("../../context/AuthContext.jsx", import.meta.url);

// Reintentos que hace el cliente cuando /api/auth/me dice "no autenticado"
// pero HAY sesión cacheada.
async function ventanaDeReintentos() {
  const source = await readFile(AUTH_CONTEXT, "utf8");
  const m = source.match(/const delays = \[([^\]]+)\];/);
  assert.ok(m, "no se localizan los reintentos de hidratación");
  return m[1]
    .split(",")
    .map((n) => Number(n.trim()))
    .reduce((a, b) => a + b, 0);
}

test("el cliente aguanta al menos lo que el backend tolera", async () => {
  // El backend NO borra el refresh token al rotarlo: lo deja válido durante una
  // ventana de gracia para que los refrescos concurrentes no se maten entre sí.
  // Si el cliente se rinde ANTES de que acabe esa ventana, borra una sesión que
  // seguía siendo válida: páginas de usuario vacías, "No se pudo cargar el
  // perfil" y el modal de iniciar sesión con la sesión abierta.
  const ventana = await ventanaDeReintentos();
  assert.ok(
    ventana >= REFRESH_ROTATION_GRACE_MS,
    `el cliente se rinde a los ${ventana}ms y el backend tolera ${REFRESH_ROTATION_GRACE_MS}ms`,
  );
});

test("los reintentos van espaciándose, no martillean", async () => {
  const source = await readFile(AUTH_CONTEXT, "utf8");
  const delays = source
    .match(/const delays = \[([^\]]+)\];/)[1]
    .split(",")
    .map((n) => Number(n.trim()));

  assert.ok(delays.length >= 5);
  for (let i = 1; i < delays.length; i += 1) {
    assert.ok(
      delays[i] >= delays[i - 1],
      `el reintento ${i} (${delays[i]}ms) llega antes que el anterior`,
    );
  }
});

test("un fallo de red o 5xx nunca cierra la sesión", async () => {
  const source = await readFile(AUTH_CONTEXT, "utf8");

  // "No he podido comprobarlo" no es "no tienes sesión": ante red caída o 5xx
  // del túnel se conserva lo cacheado.
  assert.match(source, /catch \{\s*\/\/ Red caída[\s\S]{0,160}?return readAuthUserCache\(\);/);
  assert.match(source, /if \(res\.status >= 500\) \{[\s\S]{0,160}?return readAuthUserCache\(\);/);
  // Y en la hidratación, un 5xx se lanza para que el catch conserve la sesión.
  assert.match(source, /if \(res\.status >= 500\) \{[\s\S]{0,200}?throw err;/);
});
