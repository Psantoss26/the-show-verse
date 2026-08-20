// ¿Qué sabemos del estado de un título después de preguntarle al backend?
//
// Lo usa /api/trakt/item/status, que pese al nombre sirve SOBRE TODO el estado
// propio de esta app (visto, favorito, pendiente, puntuación); Trakt es solo el
// respaldo para quien lo tenga conectado.
//
// La distinción importa porque las dos respuestas equivocadas hacen daño de
// formas distintas:
//   - Decir "sin estado" cuando en realidad no se sabe deja los botones de la
//     ficha en blanco (el fallo de "entrar y salir de la ficha y verlos vacíos").
//   - Decir "no se sabe" cuando sí se sabe devuelve un 503 en cada ficha, se
//     reintenta para siempre y ensucia la consola sin que haya nada que arreglar.
export const ITEM_STATUS_OUTCOME = Object.freeze({
  RESUELTO: 'resuelto',       // el backend contestó: su respuesta manda
  SIN_SESION: 'sin-sesion',   // no hay sesión utilizable: no hay estado que dar
  NO_CONCLUYENTE: 'no-concluyente', // no se pudo saber: conservar lo que hubiera
});

/**
 * @param {{ok?: boolean, skipped?: boolean, status?: number}} backend
 *   Lo que devuelve `backendFetchJson`.
 */
export function classifyBackendItemStatus(backend) {
  if (backend?.ok) return ITEM_STATUS_OUTCOME.RESUELTO;

  // Un 404 es autoritativo: el título NO está en las listas del usuario.
  if (backend?.status === 404) return ITEM_STATUS_OUTCOME.RESUELTO;

  // CUALQUIER 401 que salga de `backendFetchJson` significa sesión inservible, y
  // no hay que hilar más fino porque para cuando devuelve ya AGOTÓ la renovación:
  //   - `skipped` + 401 -> no había access token y el refresco (esperado) falló.
  //   - 401 de verdad    -> el backend rechazó el token y, si había refresco, ya
  //                         se reintentó con uno nuevo y volvió a rechazarlo.
  // Así que no queda ninguna carrera con la rotación de tokens de la que
  // protegerse: el usuario no tiene estado, igual que uno anónimo.
  //
  // Tratarlo como "no se sabe" es lo que producía un 503 en CADA ficha, en bucle
  // y para siempre, para cualquiera con cookies caducadas (basta un
  // `showverse_access_token` viejo sin cookie de refresco). Una caída real del
  // backend llega como 5xx o como excepción de red, y esa sí es no concluyente.
  if (backend?.status === 401) {
    return ITEM_STATUS_OUTCOME.SIN_SESION;
  }

  return ITEM_STATUS_OUTCOME.NO_CONCLUYENTE;
}
