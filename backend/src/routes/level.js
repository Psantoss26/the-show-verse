// backend/src/routes/level.js
// Nivel, experiencia y logros de un usuario.
//
// Público, igual que el perfil: el nivel de un miembro se ve desde su perfil sin
// necesidad de sesión. `?refresh=1` solo lo admite el propio usuario, para que
// nadie pueda forzar el recálculo de perfiles ajenos.

import { db } from '../db/client.js';
import { findUserByUsername } from '../lib/userProfile.js';
import { getLevelState } from '../level/store.js';
import { ACHIEVEMENTS, ACHIEVEMENT_FAMILIES } from '../level/achievements.js';
import { TIERS, MAX_LEVEL } from '../level/curve.js';
import { XP_SOURCES } from '../level/rules.js';

export default async function levelRoutes(fastify) {
  // Catálogo estático: rangos, fuentes de XP y logros. Sirve para que el frontend
  // pueda explicar el sistema sin duplicar los números del backend.
  fastify.get('/level/catalog', async (req, reply) => {
    reply.header('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    return {
      maxLevel: MAX_LEVEL,
      tiers: TIERS,
      sources: XP_SOURCES.map(({ key, label, weight }) => ({ key, label, weight })),
      families: ACHIEVEMENT_FAMILIES,
      achievements: ACHIEVEMENTS,
    };
  });

  fastify.get('/:username/level', async (req, reply) => {
    const target = await findUserByUsername(db, req.params.username);
    if (!target) return reply.status(404).send({ error: 'User not found' });

    const isSelf = Boolean(req.user?.id && req.user.id === target.id);
    const refresh = isSelf && ['1', 'true'].includes(String(req.query?.refresh || ''));

    const level = await getLevelState(db, target.id, { refresh });

    // El estado se recalcula cada minuto: no tiene sentido cachearlo en el borde.
    reply.header('Cache-Control', 'private, max-age=30');
    return { username: target.username, isSelf, ...level };
  });
}
