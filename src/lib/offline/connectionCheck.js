// Decide si el servidor está caído antes de pasar la app a solo lectura.
//
// Al volver a una página que llevaba un rato en segundo plano (o a la app de
// Android) las primeras peticiones fallan aunque haya conexión: la red del
// dispositivo despierta, el sistema cortó la petición que estaba en vuelo al
// congelar la página o cambia de red (ERR_NETWORK_CHANGED). Por eso:
// - con la página oculta no se sondea ni se da veredicto (`null`: se mantiene
//   el estado actual);
// - un fallo de una sonda que empezó antes de un paso por segundo plano no
//   cuenta: se repite;
// - el servidor solo se da por caído si fallan la sonda y todas las
//   confirmaciones, espaciadas por CONFIRM_DELAYS_MS;
// - sin red en el dispositivo (`navigator.onLine === false`) no hay nada que
//   confirmar.
// Con service worker cada sonda ya son dos (public/sw.js, HEALTH_CONFIRM_MS).
export const CONFIRM_DELAYS_MS = [3000, 6000];
const MAX_PROBES = CONFIRM_DELAYS_MS.length + 3;

export async function checkConnection({ probe, wait, isHidden, isDeviceOffline, hiddenEpoch }) {
  let failures = 0;
  for (let probes = 0; probes < MAX_PROBES; probes += 1) {
    if (isHidden()) return null;
    const epoch = hiddenEpoch();
    if (await probe()) return true;
    if (isHidden()) return null;
    if (isDeviceOffline()) return false;
    if (epoch !== hiddenEpoch()) continue;
    if (failures >= CONFIRM_DELAYS_MS.length) return false;
    await wait(CONFIRM_DELAYS_MS[failures]);
    failures += 1;
  }
  return false;
}
