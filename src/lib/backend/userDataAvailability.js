// src/lib/backend/userDataAvailability.js
//
// «NO HAY SESIÓN» NO ES LO MISMO QUE «NO HE PODIDO COMPROBARLO»,
// y las rutas de datos de las páginas de usuario lo estaban confundiendo.
//
// EL FALLO QUE ARREGLA
// Las rutas de las páginas de usuario (Historial, En progreso, Completadas)
// intentan primero el backend propio y, si la llamada no sale bien, CAEN al
// camino heredado de Trakt:
//
//   if (hasBackendCredentials(request)) {
//     try { const backend = await backendFetchJson(...);
//           if (backend.ok) return { connected: true, items } }
//     catch (e) { console.error(e) }        // ← se cae en silencio
//   }
//   ...
//   if (!accessToken && !refreshToken)      // sin cuenta de Trakt
//     return { connected: false, items: [] }   // ← «no estás conectado»
//
// Quien entra con cuenta propia y sin Trakt —el caso normal— recibía
// `connected: false` en cuanto la llamada al backend fallaba por CUALQUIER
// motivo pasajero. Reproducido en local: abrir fichas repetidamente
// (DetailModal/DetailsClient) dispara ráfagas de decenas de peticiones al
// backend por apertura; a las pocas fichas el backend empieza a devolver
// errores y a partir de ahí `/api/trakt/show/in-progress` responde
// `connected: false` con la sesión intacta.
//
// El cliente se lo cree, y el daño es peor que un hueco pasajero:
//   · In progress/Completadas pintan el aviso de «Inicia sesión» Y BORRAN su
//     caché (`markDisconnected` / `loadData`), así que la página se queda en
//     blanco aunque el backend se recupere.
//   · Historial pinta «No se encontraron resultados» con 0 cargados.
//   · Favoritos aguanta porque no pregunta a esta ruta y pinta de su propia
//     caché protegida: de ahí que fuera la única que seguía mostrando datos.
//
// LA REGLA
// La autoridad sobre si la sesión sigue viva es la capa de auth
// (`/api/auth/me` + AuthContext), NO una ruta de datos. Ante un fallo del
// backend, una ruta de datos responde «no disponible» (503) y se calla; el
// cliente ya sabe qué hacer con eso: conservar lo cacheado y no desconectar
// (ver `isServerUnavailable`/`isUnavailableStatus` en lib/offline/serverError.js,
// y los `catch` de HistoryClient.loadHistory e InProgressClient.loadData).
//
// Equivocarse hacia «no disponible» es seguro: si la sesión de verdad ha
// terminado, AuthContext lo detecta y cierra sesión, y entonces el aviso de
// «Inicia sesión» aparece por el camino correcto. Equivocarse al contrario es
// justo el fallo de arriba.
//
// Misma distinción que `sessionAvailability.js` hace para /api/auth/me; aquí
// aplicada a las rutas de datos.

// Sin `next/server`: este módulo se mantiene PURO para poder probarlo con
// `node --test` (igual que su hermano `sessionAvailability.js`). Aquí no hay
// cookies que escribir, así que una `Response` estándar basta y Next la sirve
// igual.

// 503 y no 200: `isUnavailableStatus` (>=500 o 429) ya está cableado en los
// clientes como «el servidor no está, conserva lo que tengas».
export const DEGRADED_USER_DATA_STATUS = 503;

/**
 * ¿Hay que responder «no he podido comprobarlo» en vez del veredicto heredado
 * de Trakt (`connected: false`)?
 *
 * @param {object} params
 * @param {boolean} params.hadBackendCredentials Si la petición traía sesión propia.
 * @param {boolean} params.backendFailed Si la llamada al backend no salió bien.
 * @param {boolean} params.hasTraktTokens Si además hay cuenta de Trakt conectada.
 */
export function shouldReportBackendDegraded({
  hadBackendCredentials = false,
  backendFailed = false,
  hasTraktTokens = false,
} = {}) {
  // Sin sesión propia esto es un usuario heredado de Trakt: su veredicto de
  // siempre es el correcto.
  if (!hadBackendCredentials) return false;
  if (!backendFailed) return false;
  // Con Trakt conectado el camino heredado puede traer datos REALES. Se le deja
  // correr; solo cubrimos a quien se quedaría sin ninguna fuente.
  if (hasTraktTokens) return false;
  return true;
}

/**
 * Respuesta para «tienes sesión, pero ahora mismo no puedo traerte los datos».
 * `connected: true` es la verdad: la sesión está viva. `degraded: true` sigue la
 * convención que ya usan /api/trakt/item/status y /api/plex/auth/status.
 */
export function degradedUserDataResponse(extra = {}) {
  return Response.json(
    { connected: true, degraded: true, ...extra },
    { status: DEGRADED_USER_DATA_STATUS },
  );
}
