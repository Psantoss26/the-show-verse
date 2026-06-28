// src/lib/refreshRotation.js
// Rotación de refresh tokens TOLERANTE A CONCURRENCIA.
//
// Problema (logout sin motivo al volver):
//   El access token vive 15 min. Al volver a la app desde un dispositivo con
//   sesión iniciada, ese access token ya caducó y la carga del dashboard dispara
//   muchas peticiones a la vez; TODAS intentan refrescar el MISMO refresh token.
//   Si la rotación borra el token usado de inmediato, la primera petición gana y
//   el resto recibe 401 («token no encontrado»). /api/auth/me pierde esa carrera,
//   responde «no autenticado» y la sesión se cierra aunque el refresh token
//   siguiera siendo válido 30 días.
//
// Solución:
//   En vez de BORRAR el refresh token al rotarlo, lo «retiramos» acortando su
//   expiración a una breve ventana de gracia. Durante esa ventana, los refrescos
//   concurrentes con el mismo token siguen siendo válidos y devuelven un par
//   nuevo, en lugar de fallar. Pasada la ventana, el token caduca de forma
//   natural y deja de aceptarse (la rotación sigue siendo efectiva).
//
// Este módulo expone la constante de gracia y un MODELO EN MEMORIA de la
// rotación que usan los tests. La ruta POST /v1/auth/refresh implementa la MISMA
// lógica sobre la base de datos (UPDATE de expires_at en lugar de DELETE).

export const REFRESH_ROTATION_GRACE_MS = 60 * 1000; // 60 s
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

export function graceExpiry(now = Date.now(), graceMs = REFRESH_ROTATION_GRACE_MS) {
  return new Date(now + graceMs);
}

/**
 * Modelo en memoria de la tabla `refresh_tokens` para tests.
 * `store` es un array de objetos { hash, expiresAt: Date }.
 *
 * Refleja exactamente lo que hace la ruta real sobre la BD:
 *   1. Busca el token presentado que coincide y NO ha caducado (WHERE de la BD).
 *   2. Si no existe → { ok: false }.
 *   3. Si existe → lo retira acortando su expiración a la ventana de gracia
 *      (sólo acorta, nunca extiende), emite un token nuevo y limpia los ya
 *      caducados.
 *
 * @returns {{ ok: boolean, newHash: string|null }}
 */
export function rotateRefreshTokenInStore(
  store,
  presentedHash,
  issueNewHash,
  { now = Date.now(), graceMs = REFRESH_ROTATION_GRACE_MS, refreshTtlMs = REFRESH_TOKEN_TTL_MS } = {},
) {
  const nowDate = new Date(now);

  // (1) Igual que el SELECT ... WHERE token_hash = ? AND expires_at > now()
  const token = store.find(
    (t) => t.hash === presentedHash && t.expiresAt > nowDate,
  );
  if (!token) return { ok: false, newHash: null };

  // (2) Retirar con gracia: sólo ACORTAR la expiración, nunca extenderla.
  const retireAt = graceExpiry(now, graceMs);
  if (token.expiresAt > retireAt) token.expiresAt = retireAt;

  // (3) Emitir el token nuevo (vida larga).
  const newHash = issueNewHash();
  store.push({ hash: newHash, expiresAt: new Date(now + refreshTtlMs) });

  // (4) Mantenimiento: eliminar los tokens ya caducados.
  for (let i = store.length - 1; i >= 0; i -= 1) {
    if (store[i].expiresAt <= nowDate) store.splice(i, 1);
  }

  return { ok: true, newHash };
}
