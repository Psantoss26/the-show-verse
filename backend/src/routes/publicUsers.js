// src/routes/publicUsers.js
// Lectura pública del perfil social. La información devuelta ya está agregada
// por buildUserProfile; no expone eventos privados ni preferencias del usuario.

import { db } from '../db/client.js';
import {
  buildUserProfile,
  findUserByUsername,
  getUserActivity,
} from '../lib/userProfile.js';

export default async function publicUsersRoutes(fastify) {
  // GET /users/public/resolve-usernames?usernames=a,b — resuelve en bloque los
  // handles que pertenecen a miembros reales. Se usa en comentarios importados
  // para no convertir autores externos (por ejemplo, de Trakt) en enlaces rotos.
  fastify.get('/resolve-usernames', async (req, reply) => {
    const requested = String(req.query?.usernames || '')
      .split(',')
      .map((username) => username.trim())
      .filter((username) => username.length > 0 && username.length <= 64)
      .slice(0, 40);
    const unique = [...new Map(requested.map((username) => [username.toLowerCase(), username])).values()];

    const matches = await Promise.all(
      unique.map((username) => findUserByUsername(db, username)),
    );

    return reply.send({
      usernames: matches
        .filter(Boolean)
        .map((user) => user.username),
    });
  });

  // GET /users/public/:username/profile — perfil y estadísticas agregadas.
  // `req.user` es opcional: si existe, permite conservar isSelf/isFollowing.
  fastify.get('/:username/profile', async (req, reply) => {
    const target = await findUserByUsername(db, req.params.username);
    if (!target) return reply.status(404).send({ error: 'User not found' });

    const profile = await buildUserProfile(db, target, req.user?.id || null);
    return reply.send({ profile });
  });

  // GET /users/public/:username/activity — el feed forma parte del perfil
  // público. `req.user` sigue siendo opcional para no exigir una sesión del
  // backend al visitar un perfil desde la app.
  fastify.get('/:username/activity', async (req, reply) => {
    const target = await findUserByUsername(db, req.params.username);
    if (!target) return reply.status(404).send({ error: 'User not found' });

    const page = await getUserActivity(db, target.id, {
      limit: req.query?.limit,
      offset: req.query?.offset,
    });
    return reply.send(page);
  });
}
