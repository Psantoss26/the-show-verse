// Entregas pendientes del login de Google iniciado desde la app de Android.
//
// EL PROBLEMA. En la app, el login ocurre en DOS contextos distintos: el usuario
// pulsa el botón dentro del WebView, pero Google exige un navegador de verdad,
// así que el formulario y la vuelta pasan por Chrome. Son dos almacenes de
// cookies separados: lo que se guarda en uno no existe en el otro. Por eso el
// diseño anterior no podía funcionar de forma fiable — validaba el `state`
// contra una cookie que el WebView ni siquiera llega a guardar (cancelamos esa
// navegación al mandar Google fuera), y dependía de que Chrome devolviese el
// control a la app, cosa que bloquea cuando la redirección no viene de un gesto.
//
// LA SOLUCIÓN. El puente deja de ser la cookie y pasa a ser el servidor:
//   1. El WebView inventa un identificador y abre el login con él.
//   2. Chrome completa el login; el callback valida el `state` contra ESTE
//      almacén (no contra una cookie) y deja aquí los tokens.
//   3. El WebView los reclama con su identificador, y es en ESA respuesta donde
//      se escriben las cookies de sesión: caen en el almacén correcto.
// Así la sesión llega aunque el navegador no devuelva nunca el control.
//
// ÁMBITO. Vive en memoria del proceso web, que es de donde salen y a donde
// vuelven las dos peticiones. Es suficiente para un despliegue de una sola
// instancia (el contenedor `web` del NAS). Si algún día la web se reparte entre
// varias instancias, esto tiene que mudarse a Redis o a una tabla.

const TTL_MS = 10 * 60 * 1000; // lo que dura un login razonable
const MAXIMO = 500; // cota defensiva: nadie debería tener tantos en vuelo

const pendientes = new Map();

function limpiarCaducados(ahora) {
  for (const [clave, dato] of pendientes) {
    if (ahora - dato.creado > TTL_MS) pendientes.delete(clave);
  }
}

/** Abre una entrega para el identificador que ha inventado la app. */
export function abrirEntrega(appId, { next = "/", ahora = Date.now() } = {}) {
  if (!appId) return false;
  limpiarCaducados(ahora);
  if (pendientes.size >= MAXIMO) return false;
  pendientes.set(appId, { next, state: null, tokens: null, creado: ahora });
  return true;
}

/** Ata el `state` de OAuth a la entrega: es lo que sustituye a la cookie. */
export function asociarEstado(appId, state, { ahora = Date.now() } = {}) {
  const dato = pendientes.get(appId);
  if (!dato || ahora - dato.creado > TTL_MS) return false;
  dato.state = state;
  return true;
}

/**
 * Busca la entrega por su `state`. Es la validación anti-CSRF: un `state` que no
 * salga de una entrega abierta aquí no vale, exactamente igual que antes no
 * valía uno que no coincidiera con la cookie.
 */
export function buscarPorEstado(state, { ahora = Date.now() } = {}) {
  if (!state) return null;
  limpiarCaducados(ahora);
  for (const [appId, dato] of pendientes) {
    if (dato.state && dato.state === state) return { appId, ...dato };
  }
  return null;
}

/** El navegador ya tiene los tokens: se dejan listos para que la app los recoja. */
export function completarEntrega(appId, tokens, { ahora = Date.now() } = {}) {
  const dato = pendientes.get(appId);
  if (!dato || ahora - dato.creado > TTL_MS) return false;
  dato.tokens = tokens;
  return true;
}

/**
 * La app recoge su entrega. DE UN SOLO USO: se borra al entregarla, para que un
 * identificador filtrado no sirva dos veces.
 */
export function reclamarEntrega(appId, { ahora = Date.now() } = {}) {
  limpiarCaducados(ahora);
  const dato = pendientes.get(appId);
  if (!dato) return { estado: "desconocida" };
  if (!dato.tokens) return { estado: "pendiente" };
  pendientes.delete(appId);
  return { estado: "lista", tokens: dato.tokens, next: dato.next };
}

/**
 * Estado de la entrega SIN consumirla: "pendiente" | "lista" | "desconocida".
 * Lo consulta el nativo mientras el usuario está en el navegador, para saber
 * cuándo traer la app al frente.
 */
export function estadoEntrega(appId, { ahora = Date.now() } = {}) {
  limpiarCaducados(ahora);
  const dato = pendientes.get(appId);
  if (!dato) return "desconocida";
  return dato.tokens ? "lista" : "pendiente";
}

/** Solo para los tests. */
export function __vaciar() {
  pendientes.clear();
}
