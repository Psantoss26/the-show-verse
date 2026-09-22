// Espera antes de cada reintento de la consulta del estado de un título
// (visto, puntuación, favorito, pendiente, episodios vistos).
//
// Los primeros intentos son rápidos para los fallos sueltos. Los siguientes se
// espacian hasta cubrir holgadamente la ventana de un minuto del rate limit del
// backend: si se cortaran antes (antes eran tres intentos en ~8s), una racha de
// 429/503 al pasar por varios títulos seguidos agotaba los reintentos DENTRO de
// esa ventana y los botones se quedaban cargando para siempre. A partir del
// último valor se sigue reintentando con esa misma espera: una consulta cada
// 30s mientras la ficha siga abierta es un coste despreciable.
const STATUS_RETRY_DELAYS_MS = [900, 2200, 4500, 9000, 18000, 30000];

/** @param {number} intento 1 para el primer reintento, 2 para el segundo… */
export function statusRetryDelay(intento) {
  const index = Math.min(
    Math.max(intento, 1) - 1,
    STATUS_RETRY_DELAYS_MS.length - 1,
  );
  return STATUS_RETRY_DELAYS_MS[index];
}
