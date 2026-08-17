// backend/src/plugins/levelInvalidation.js
// Invalida la caché de nivel tras una mutación que puntúa.
//
// Un único hook en lugar de una llamada repartida por cada manejador: así no hay
// forma de añadir una ruta nueva y olvidarse de invalidar, y la lista de lo que
// puntúa queda en un sitio legible. La caché tiene TTL corto de todas formas, así
// que esto es una mejora de inmediatez, nunca un requisito de corrección.

import fp from 'fastify-plugin';

import { db } from '../db/client.js';
import { invalidateLevelState } from '../level/store.js';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Prefijos cuyas mutaciones cambian algo que da XP. Se comparan por segmento
// completo: /v1/historyX no es /v1/history.
const SCORING_PREFIXES = [
  '/v1/history',
  '/v1/favorites',
  '/v1/watchlist',
  '/v1/ratings',
  '/v1/lists',
  '/v1/import',
  '/v1/community',
  '/v1/users',            // seguir/dejar de seguir y destacados del perfil
];

// Dentro de /v1/users solo puntúan estas mutaciones; el resto (preferencias,
// avatar, contraseña) no da XP.
const USERS_SCORING = [/\/follow$/, /\/profile-favorites$/];

/** ¿Esta respuesta terminó cambiando algo que puntúa? */
export function affectsLevel(request) {
  if (!request) return false;
  const method = String(request.method || '').toUpperCase();
  if (!MUTATING_METHODS.has(method)) return false;

  const status = Number(request.statusCode);
  if (!Number.isFinite(status) || status >= 400) return false;

  const path = String(request.url || '').split('?')[0];
  const prefix = SCORING_PREFIXES.find(
    (candidate) => path === candidate || path.startsWith(`${candidate}/`),
  );
  if (!prefix) return false;

  if (prefix === '/v1/users') {
    return USERS_SCORING.some((pattern) => pattern.test(path));
  }
  return true;
}

async function levelInvalidationPlugin(fastify) {
  fastify.addHook('onResponse', async (req, reply) => {
    if (!req.user?.id) return;
    if (!affectsLevel({ method: req.method, url: req.url, statusCode: reply.statusCode })) return;
    // Best-effort y fuera del camino de la respuesta: ya se ha enviado.
    await invalidateLevelState(db, req.user.id);
  });
}

export default fp(levelInvalidationPlugin, { name: 'level-invalidation' });
