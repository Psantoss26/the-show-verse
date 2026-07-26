// Agrupa en una única actividad un lote histórico creado al usar «Marcar
// serie» antes de que existiera activity_group. Conserva todas las filas de
// episodios: solo añade la identidad que el feed usa para colapsarlas.
//
// Uso:
//   npm run activity:group-legacy-show -- --username <usuario> --tmdb-id <id>
//   npm run activity:group-legacy-show -- --username <usuario> --tmdb-id <id> --watched-at <ISO> --apply
//
// Sin --apply es siempre una vista previa. Si hay más de un lote para la serie,
// exige --watched-at para evitar agrupar visionados reales distintos.

import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { closeDb, db } from '../db/client.js';
import { users, watchHistory } from '../db/schema.js';

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function fail(message) {
  console.error(`Error: ${message}`);
  console.error('Uso: npm run activity:group-legacy-show -- --username <usuario> --tmdb-id <id> [--watched-at <ISO>] [--apply]');
  process.exitCode = 1;
}

const username = String(option('--username') || '').trim();
const tmdbId = Number(option('--tmdb-id'));
const watchedAtInput = option('--watched-at');
const apply = process.argv.includes('--apply');

if (!username || !Number.isInteger(tmdbId) || tmdbId <= 0) {
  fail('Se requieren --username y un --tmdb-id válido.');
} else {
  try {
    const [user] = await db
      .select({ id: users.id, username: users.username, displayName: users.displayName })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (!user) {
      fail(`No existe el usuario @${username}.`);
    } else {
      const conditions = and(
        eq(watchHistory.userId, user.id),
        eq(watchHistory.tmdbId, tmdbId),
        eq(watchHistory.mediaType, 'tv'),
        isNull(watchHistory.activityGroup),
        isNotNull(watchHistory.season),
        isNotNull(watchHistory.episode),
      );
      const batches = await db
        .select({
          watchedAt: watchHistory.watchedAt,
          episodes: sql`count(*)::int`,
        })
        .from(watchHistory)
        .where(conditions)
        .groupBy(watchHistory.watchedAt)
        .orderBy(desc(watchHistory.watchedAt));

      const validBatches = batches.filter((batch) => Number(batch.episodes) > 1);
      if (!validBatches.length) {
        console.log(`No hay lotes heredados sin agrupar para @${user.username} y TMDb ${tmdbId}.`);
      } else {
        const requestedDate = watchedAtInput ? new Date(watchedAtInput) : null;
        if (watchedAtInput && Number.isNaN(requestedDate?.getTime())) {
          fail('--watched-at debe ser una fecha ISO válida.');
        } else {
          const batch = requestedDate
            ? validBatches.find((candidate) => new Date(candidate.watchedAt).getTime() === requestedDate.getTime())
            : validBatches.length === 1
              ? validBatches[0]
              : null;

          if (!batch) {
            console.log(`Se encontraron ${validBatches.length} lotes. Selecciona uno con --watched-at:`);
            for (const candidate of validBatches) {
              console.log(`- ${new Date(candidate.watchedAt).toISOString()} · ${candidate.episodes} episodios`);
            }
            if (!requestedDate) process.exitCode = 1;
          } else {
            const watchedAt = new Date(batch.watchedAt);
            const activityGroup = `legacy-show-complete:${user.id}:${tmdbId}:${watchedAt.getTime()}`;
            console.log(`${apply ? 'Agrupando' : 'Vista previa:'} @${user.username} · TMDb ${tmdbId} · ${batch.episodes} episodios · ${watchedAt.toISOString()}`);

            if (apply) {
              const updated = await db
                .update(watchHistory)
                .set({ activityGroup })
                .where(and(conditions, eq(watchHistory.watchedAt, watchedAt)))
                .returning({ id: watchHistory.id });
              console.log(`Listo: ${updated.length} episodios se mostrarán como una sola actividad de serie completada.`);
            } else {
              console.log('No se ha modificado ningún dato. Añade --apply cuando hayas confirmado el lote.');
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('No se pudo reparar la actividad heredada.', error?.message || error);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
