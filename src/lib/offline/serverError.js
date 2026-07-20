// ¿El error de un fetch a /api indica que el SERVIDOR PROPIO (NAS) no está
// disponible —en vez de un fallo real de datos/autenticación del usuario?
//
// Cubre:
//   - 5xx: el túnel Cloudflare responde 5xx cuando el origen (NAS) está caído.
//   - 429: rate limit transitorio.
//   - error de RED: el `fetch` se rechaza sin respuesta (no hay `status`).
//
// En esos casos las páginas de usuario deben CONSERVAR su último contenido
// cacheado (modo offline con el servidor apagado) en vez de vaciarlo o forzar el
// cierre de sesión. 401/403 (autenticación real caducada/denegada) NO cuentan como
// "servidor caído": ahí sí procede desconectar.
export function isServerUnavailable(error) {
  if (!error) return false;
  if (error.name === "AbortError") return false;
  const status = Number(error.status ?? error?.payload?.upstreamStatus ?? 0);
  if (status === 401 || status === 403) return false;
  // 5xx / 429 / sin status (error de red o excepción sin respuesta) → no disponible.
  return status >= 500 || status === 429 || !status;
}

// Igual que arriba pero a partir del `status` de una Response ya obtenida (no un
// Error lanzado). Aquí un status 0/ausente no es concluyente, así que solo cuentan
// 5xx y 429.
export function isUnavailableStatus(status) {
  const s = Number(status || 0);
  if (s === 401 || s === 403) return false;
  return s >= 500 || s === 429;
}
