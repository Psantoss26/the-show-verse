// src/plugins/auth.js
// Plugin de Fastify: decora req con el usuario autenticado

import fp from 'fastify-plugin';
import { verifyAccessToken } from '../lib/jwt.js';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

async function authPlugin(fastify) {
  /**
   * Decorator: extrae y verifica el Bearer token del header Authorization.
   * Añade `req.user` con los datos del usuario si está autenticado.
   * No lanza error si no hay token — los endpoints lo comprueban ellos mismos.
   */
  fastify.decorateRequest('user', null);

  fastify.addHook('preHandler', async (req) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return;

    const token = authHeader.slice(7);
    try {
      const payload = await verifyAccessToken(token);
      if (!payload?.sub) return;

      // Cargamos datos mínimos del usuario desde BD
      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          plan: users.plan,
          planExpiresAt: users.planExpiresAt,
          isActive: users.isActive,
        })
        .from(users)
        .where(eq(users.id, payload.sub))
        .limit(1);

      if (user?.isActive) {
        req.user = user;
      }
    } catch {
      // Token inválido o expirado — req.user queda null
    }
  });

  /**
   * Función helper para proteger rutas: lanza 401 si no hay usuario.
   */
  fastify.decorate('requireAuth', async function (req, reply) {
    if (!req.user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }
  });
}

export default fp(authPlugin, { name: 'auth' });
