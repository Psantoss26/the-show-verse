// src/routes/publicUsers.js
// Lectura pública del perfil social. La información devuelta ya está agregada
// por buildUserProfile; no expone eventos privados ni preferencias del usuario.

import { db } from '../db/client.js';
import { buildUserProfile, findUserByUsername } from '../lib/userProfile.js';

export default async function publicUsersRoutes(fastify) {
  // GET /users/public/:username/profile — perfil y estadísticas agregadas.
  // `req.user` es opcional: si existe, permite conservar isSelf/isFollowing.
  fastify.get('/:username/profile', async (req, reply) => {
    const target = await findUserByUsername(db, req.params.username);
    if (!target) return reply.status(404).send({ error: 'User not found' });

    const profile = await buildUserProfile(db, target, req.user?.id || null);
    return reply.send({ profile });
  });
}
