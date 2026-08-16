// Clave de la instantánea del usuario en el navegador.
//
// Vive aquí, y no dentro de AuthContext, porque hay DOS lectores: el propio
// contexto (React, tras hidratar) y el script de arranque del layout, que la lee
// de forma síncrona antes del primer pintado para que el avatar no pase por un
// hueco vacío al recargar. Una sola constante evita que esas dos rutas se
// separen, igual que se hace con las preferencias en `@/lib/artworkApi`.
export const AUTH_USER_CACHE_KEY = "showverse:auth:user:v1";
