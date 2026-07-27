"use client";

// Lee el id del usuario logueado de forma SÍNCRONA desde la caché de auth. Sirve
// para, ya en el PRIMER render (montaje), validar que una caché de lista de
// usuario (Favoritos/Pendientes/…) pertenece a la cuenta ACTUAL y no a una
// anterior: al cambiar de cuenta, la caché en localStorage es global y, sin esta
// comprobación, la restauración "atrás" pintaba el contenido del usuario previo.
//
// Debe coincidir con AUTH_USER_CACHE_KEY de AuthContext.
const AUTH_USER_CACHE_KEY = "showverse:auth:user:v1";

export function readCachedUserId() {
  if (typeof window === "undefined") return null;
  try {
    const raw =
      window.localStorage.getItem(AUTH_USER_CACHE_KEY) ||
      window.sessionStorage.getItem(AUTH_USER_CACHE_KEY);
    if (!raw) return null;
    const id = JSON.parse(raw)?.user?.id;
    return id == null ? null : String(id);
  } catch {
    return null;
  }
}
