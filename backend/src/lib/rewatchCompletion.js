// backend/src/lib/rewatchCompletion.js
//
// Decisión de si un ping de "≥90%" del sync de reproducción (extensión + Android)
// debe registrar un PLAY nuevo en watch_history. Un play extra del mismo episodio
// es, por el modelo de capas (ver lib/showProgress.js y computeRewatchRuns), un
// REWATCH: no hay tabla aparte.
//
// Regla del "cruce del 90%":
//   - La fila de watch_progress SOLO existe mientras percent < 0.9. Si existía al
//     llegar a ≥90% (`wasInProgress`), es que veníamos reproduciendo por debajo del
//     umbral y lo cruzamos AHORA → completar (primer visionado o rewatch).
//   - Si NO existía (pings de cola 95%/98%… de una sesión ya completada, o un salto
//     directo al final sin ping previo <90%), solo registramos si NO hay ya un play
//     del mismo ítem dentro del cooldown. Así una sola sesión no genera varios plays,
//     pero un visionado real que arrancó cerca del final sí se cuenta.
//
// Con esto: exactamente UN play por sesión de visionado, y cada re-reproducción
// genuina (que vuelve a arrancar de bajo y a cruzar el 90%) crea un play = rewatch.

// Ventana para colapsar los pings de cola de una misma sesión cuando ya no hay
// fila de progreso. Debe ser mayor que el hueco entre pings (~30 s) y que la cola
// 90%→100% de un título, pero menor que cualquier hueco realista entre visionados
// distintos del mismo episodio.
export const REWATCH_COMPLETION_COOLDOWN_MS = 30 * 60 * 1000;

/**
 * @param {{ wasInProgress: boolean, hasRecentPlay: boolean }} params
 *   - wasInProgress: había fila de watch_progress (<90%) para esta clave exacta.
 *   - hasRecentPlay: existe ya un play del MISMO ítem dentro del cooldown.
 * @returns {boolean} true si se debe insertar un play (visto/rewatch).
 */
export function shouldRecordCompletion({ wasInProgress = false, hasRecentPlay = false } = {}) {
  if (wasInProgress) return true; // cruce real del 90% desde una sesión en curso
  return !hasRecentPlay; // sin fila: solo si no es un ping de cola de algo recién completado
}
