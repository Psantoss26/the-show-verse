// CUÁNDO SE REHACE SOLA LA COPIA SIN CONEXIÓN.
//
// La copia completa (prepare.js) recorre decenas de páginas, todas las fichas
// visitadas, el historial entero de Trakt y cada sección del perfil paginada.
// Antes se lanzaba en CADA apertura de la app, en cada vuelta de la conexión y
// tras CADA escritura (marcar visto, puntuar…): en producción —único entorno
// con service worker— competía sin parar con lo que el usuario estaba abriendo
// y el NAS atendía la copia antes que los dashboards. Ahora solo se rehace sola
// cuando hace falta; el botón «Actualizar» de Ajustes sigue lanzándola al momento.
export const AUTO_PREPARE_INTERVAL_MS = 12 * 60 * 60 * 1000;
// Tras un cambio de datos basta con que no se repita más de una vez por hora:
// lo que el usuario vuelve a abrir ya refresca su copia al pasar por el worker.
export const DATA_CHANGE_INTERVAL_MS = 60 * 60 * 1000;

export const preparedKey = (userId) => `showverse:offline:prepared:${userId}`;

/**
 * @param {{ last: { updatedAt?: number, build?: string } | null, build: string,
 *   pending?: boolean, reason?: "start" | "data", now?: number }} input
 */
export function shouldPrepareAutomatically({ last, build, pending = false, reason = "start", now = Date.now() }) {
  // Una copia cortada a medias se reanuda (prepare.js no repite lo ya guardado).
  if (pending) return true;
  if (!Number.isFinite(last?.updatedAt)) return true;
  // Despliegue nuevo: las páginas guardadas abrirían sin conexión el código del
  // build anterior hasta rehacerlas. Una vez por build.
  if (last.build !== build) return true;
  const age = now - last.updatedAt;
  return age >= (reason === "data" ? DATA_CHANGE_INTERVAL_MS : AUTO_PREPARE_INTERVAL_MS);
}
