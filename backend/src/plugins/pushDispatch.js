// backend/src/plugins/pushDispatch.js
// Programa las notificaciones del dispositivo tras un cambio que puede generar
// una alerta: un visto (manual o sincronizado) o un progreso de streaming.
//
// Un único hook, como levelInvalidation: las rutas no tienen que acordarse de
// avisar. Las de sincronización se autentican con el token del dispositivo, no
// con sesión, así que marcan al usuario en `req.pushUserId`.

import fp from 'fastify-plugin';

import { schedulePushDispatch } from '../lib/push.js';

// Por segmento completo: /v1/historyX no es /v1/history.
const ALERT_PREFIXES = ['/v1/history', '/v1/progress'];

/** Usuario cuyas alertas pueden haber cambiado con esta respuesta, o null. */
export function pushUserFor(request) {
  if (!request) return null;
  if (String(request.method || '').toUpperCase() !== 'POST') return null;
  const status = Number(request.statusCode);
  if (!Number.isFinite(status) || status >= 400) return null;
  if (request.pushUserId) return request.pushUserId;

  const path = String(request.url || '').split('?')[0];
  const matches = ALERT_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  return matches ? request.userId || null : null;
}

async function pushDispatchPlugin(fastify) {
  fastify.decorateRequest('pushUserId', null);
  fastify.addHook('onResponse', async (req, reply) => {
    const userId = pushUserFor({
      method: req.method,
      url: req.url,
      statusCode: reply.statusCode,
      pushUserId: req.pushUserId,
      userId: req.user?.id,
    });
    if (userId) schedulePushDispatch(userId, req.log);
  });
}

export default fp(pushDispatchPlugin, { name: 'push-dispatch' });
