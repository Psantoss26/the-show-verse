// src/lib/backend/sessionAvailability.js
//
// ¿El refresco de sesión falló porque el BACKEND no está disponible (NAS
// apagado, túnel caído, rate limit), o porque la sesión simplemente terminó?
//
// LA DISTINCIÓN ES CRÍTICA
// El cliente trata un 5xx de /api/auth/me como «no puedo comprobarlo, conservo
// la sesión cacheada» y NO cierra sesión (ver AuthContext: `if (res.status >=
// 500) return readAuthUserCache()`). Eso está bien cuando el NAS está apagado.
// Pero si un «no hay sesión» se cuela como «no disponible», la app se queda en
// un estado ZOMBI: cree que hay usuario, pero todas las peticiones de datos
// devuelven 401 y las páginas de usuario se pintan VACÍAS. Recargar no lo
// arregla, porque la caché de usuario sigue estando; solo se sale cerrando la
// pestaña (si esa caché acabó en sessionStorage, que es lo que pasa cuando
// localStorage se llena) o volviendo a iniciar sesión.
//
// `refreshBackendSession` devuelve `null` cuando NO HAY refresh token, es decir,
// sesión terminada. Antes caía en la rama `status === 0` —pensada para un fallo
// de transporte— y /api/auth/me respondía 503.
export function isBackendSessionUnavailable(result) {
  if (result == null) return false;
  const status = Number(result?.status || 0);
  return status === 0 || status === 429 || status >= 500;
}
