// src/lib/backend/refreshCoalescer.js
//
// UNIFICA LOS REFRESCOS CONCURRENTES DEL MISMO REFRESH TOKEN.
//
// EL RIESGO QUE ELIMINA
// Al caducar el access token, abrir una página dispara muchas peticiones a la
// vez y CADA ruta proxy refresca por su cuenta. El backend rota en cada refresco
// —emite un token nuevo y RETIRA el presentado, dejándolo con 60 s de vida— y
// cada respuesta escribe su propia cookie. Como el orden de llegada de los
// `Set-Cookie` no está garantizado, el navegador puede terminar guardando un
// token distinto del último emitido; si ese token acaba retirado por otra
// petición, la sesión se queda con un minuto de vida y luego muere sin
// recuperación posible (recargar no ayuda: la cookie sigue siendo la misma).
//
// OJO CON LO QUE ESTO NO ES: no está demostrado que sea la causa del fallo
// reportado de "se cierra la sesión sola". No se consiguió reproducir ese fallo
// en pruebas (ráfagas sueltas, ráfagas encadenadas y dos pestañas a la vez,
// dejando pasar la ventana de gracia). Esto cierra un agujero real por el que
// PODRÍA colarse, y de paso elimina la acumulación de tokens huérfanos.
//
// LA SOLUCIÓN
// Memorizar el refresco EN CURSO por token presentado: todas las peticiones de
// la ráfaga comparten la MISMA llamada y reciben el MISMO token nuevo, así que
// todas escriben la misma cookie y el orden deja de importar. El resultado se
// conserva unos segundos después de resolverse para que también lo aprovechen
// las rezagadas —las que llegan justo después de la ráfaga— en lugar de provocar
// una rotación extra que retiraría el token que el navegador acaba de guardar.
//
// Efecto secundario medido: se acaba la acumulación de tokens huérfanos (una
// ráfaga de 24 peticiones creaba 24 filas en `refresh_tokens`; ahora, una).

// Cuánto se conserva el resultado tras resolverse. Tiene que cubrir de sobra lo
// que tarda en llegar una respuesta rezagada de la misma ráfaga, y quedarse muy
// por debajo de la ventana de gracia del backend (60 s), para que la rotación
// siga siendo efectiva.
export const REFRESH_COALESCE_TTL_MS = 15 * 1000;

/**
 * Crea un coalescedor. Se usa uno por proceso (ver `server.js`); en los tests se
 * crean instancias aisladas con un reloj propio.
 *
 * @param {() => number} now Reloj, inyectable para los tests.
 */
export function createRefreshCoalescer({
  now = Date.now,
  ttlMs = REFRESH_COALESCE_TTL_MS,
} = {}) {
  /** @type {Map<string, { promise: Promise<any>, settledAt: number | null }>} */
  const entries = new Map();

  const purge = () => {
    const t = now();
    for (const [key, entry] of entries) {
      if (entry.settledAt !== null && t - entry.settledAt >= ttlMs) entries.delete(key);
    }
  };

  /**
   * Ejecuta `perform` como mucho una vez por token dentro de la ventana.
   * Las llamadas concurrentes (y las que lleguen hasta `ttlMs` después de
   * resolverse) reciben el MISMO resultado.
   *
   * @param {string} refreshToken Token presentado (clave de la ráfaga).
   * @param {() => Promise<any>} perform Refresco real.
   * @param {(value: any) => boolean} [isSuccess] Qué cuenta como éxito. Los
   *   fallos no se memorizan; por defecto basta con que el valor sea truthy,
   *   pero quien devuelva un objeto de error (con el status dentro) tiene que
   *   decirlo aquí para que el siguiente intento vuelva a preguntar.
   */
  return function coalesceRefresh(refreshToken, perform, isSuccess = Boolean) {
    if (!refreshToken) return perform();
    purge();

    const existing = entries.get(refreshToken);
    if (existing) return existing.promise;

    const entry = { promise: null, settledAt: null };
    entry.promise = (async () => {
      try {
        return await perform();
      } finally {
        entry.settledAt = now();
      }
    })();

    // Un refresco fallido NO se memoriza: si el backend falló por algo puntual,
    // el siguiente intento debe volver a preguntar en vez de heredar el fallo
    // durante 15 s.
    entry.promise = entry.promise.then(
      (value) => {
        if (!isSuccess(value)) entries.delete(refreshToken);
        return value;
      },
      (error) => {
        entries.delete(refreshToken);
        throw error;
      },
    );

    entries.set(refreshToken, entry);
    return entry.promise;
  };
}
