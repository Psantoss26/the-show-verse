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

// UNA SOLA COPIA A LA VEZ ENTRE PESTAÑAS. En escritorio es normal tener varias
// pestañas de la app: cada una lanzaba su copia completa en paralelo y, como la
// copia en curso deja su marca de «en marcha», una pestaña nueva la tomaba por
// interrumpida y arrancaba otra. El candado (Web Locks) lo tiene la pestaña que
// copia; las demás no esperan, simplemente no copian. Se suelta solo al cerrar
// esa pestaña, y entonces la siguiente reanuda.
export const PREPARATION_LOCK = "showverse:offline-prepare";

export async function withPreparationLock(run, locks = globalThis.navigator?.locks) {
  if (!locks?.request) return { skipped: false, value: await run() };
  return locks.request(PREPARATION_LOCK, { ifAvailable: true }, async (lock) =>
    lock ? { skipped: false, value: await run() } : { skipped: true });
}

// REANUDAR SIN REPETIR. La copia guarda qué pasos terminó; al reanudarse (se
// cerró o recargó la pestaña a mitad, lo habitual en escritorio) los salta. Antes
// solo se saltaban las páginas: las lecturas pesadas (historial completo,
// recomendaciones, secciones paginadas) se repetían enteras en cada carga y, si
// la copia nunca llegaba a terminar, en cada carga cargaban al NAS de nuevo.
export function createRunLog(run, { resumable, save }) {
  const done = new Set(resumable && Array.isArray(run?.done) ? run.done : []);
  const startedAt = run?.startedAt;
  return {
    isDone: (step) => done.has(step),
    markDone(step) {
      done.add(step);
      save({ startedAt, done: [...done] });
    },
  };
}
