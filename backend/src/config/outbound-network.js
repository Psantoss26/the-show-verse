// Conexiones salientes (TMDb, Trakt...): primero IPv4 y 2,5 s por intento.
//
// TMDb resuelve a 12 direcciones (8 IPv6 y 4 IPv4) y Node solo da 250 ms a
// cada intento de «happy eyeballs». Sin ruta IPv6 y con el event loop cargado,
// las IPv4 caducan antes de procesarse y el fetch falla con un AggregateError
// ETIMEDOUT aunque TMDb responda en ~120 ms. Mismo ajuste que el frontend
// (src/lib/server/outboundNetwork.js).
import dns from 'node:dns';
import net from 'node:net';

dns.setDefaultResultOrder('ipv4first');
net.setDefaultAutoSelectFamilyAttemptTimeout(2500);
