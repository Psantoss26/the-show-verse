import dns from "node:dns";
import net from "node:net";

// Conexiones salientes del servidor (TMDb, Trakt, OMDb, el backend...).
//
// TMDb resuelve a 12 direcciones (8 IPv6 y 4 IPv4). Node prueba cada una con
// «happy eyeballs» y, por defecto, solo le da 250 ms. En una red sin ruta IPv6
// las IPv6 fallan al instante y quedan las IPv4: si el event loop va cargado
// (next dev compilando, la máquina saturada) esos 250 ms caducan antes de que
// se procese la conexión, aunque TMDb responda en ~120 ms, y el fetch acaba en
// `TypeError: fetch failed` con un AggregateError ETIMEDOUT de 12 errores.
// Primero IPv4 y un margen holgado por intento lo evitan sin perder el
// respaldo a IPv6 donde sí funcione.
const CONNECT_ATTEMPT_TIMEOUT_MS = 2500;

let configured = false;

export function configureOutboundNetwork() {
  if (configured) return;
  configured = true;
  dns.setDefaultResultOrder("ipv4first");
  net.setDefaultAutoSelectFamilyAttemptTimeout(CONNECT_ATTEMPT_TIMEOUT_MS);
}
