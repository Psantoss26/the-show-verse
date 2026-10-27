// Votos de artwork: la selección de «Portadas y fondos» de cada usuario cuenta
// como un voto por su imagen, y la más votada pasa a ser la imagen por defecto
// del título para todo el mundo (con o sin sesión).
//
// Un usuario = un voto por título y tipo de imagen: la fila guarda su selección
// ACTUAL, así que cambiar de imagen mueve el voto y restablecer lo retira. La
// selección propia sigue mandando sobre la de la comunidad en el cliente.

import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { artworkVotes } from '../db/schema.js';

export const ARTWORK_VOTE_KINDS = ['poster', 'mobilePoster', 'backdrop', 'background', 'logo'];

// Refleja en `artwork_votes` los mismos cambios que se acaban de aplicar a
// `artworkOverrides`. Va dentro de la transacción del guardado (`executor`),
// así que los votos nunca se separan de la selección que representan.
export async function applyArtworkVoteChanges(executor, userId, changes) {
  for (const change of changes || []) {
    const key = {
      userId,
      mediaType: change.type,
      tmdbId: Number(change.id),
      kind: change.kind,
    };

    if (change.filePath) {
      await executor
        .insert(artworkVotes)
        .values({ ...key, filePath: change.filePath, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [artworkVotes.userId, artworkVotes.mediaType, artworkVotes.tmdbId, artworkVotes.kind],
          set: { filePath: change.filePath, updatedAt: new Date() },
        });
    } else {
      await executor
        .delete(artworkVotes)
        .where(
          and(
            eq(artworkVotes.userId, key.userId),
            eq(artworkVotes.mediaType, key.mediaType),
            eq(artworkVotes.tmdbId, key.tmdbId),
            eq(artworkVotes.kind, key.kind),
          ),
        );
    }
  }
}

// Filas ya agrupadas (kind, filePath, votes, lastVotedAt) → la ganadora de cada
// tipo. Empate en votos: la elegida más recientemente, que es la que refleja
// mejor lo que la gente prefiere ahora.
export function pickTopVotedArtwork(rows) {
  const best = {};
  for (const row of rows || []) {
    if (!ARTWORK_VOTE_KINDS.includes(row?.kind) || !row.filePath) continue;
    const votes = Number(row.votes) || 0;
    const at = new Date(row.lastVotedAt || 0).getTime() || 0;
    const current = best[row.kind];
    if (!current || votes > current.votes || (votes === current.votes && at > current.at)) {
      best[row.kind] = { filePath: row.filePath, votes, at };
    }
  }
  return Object.fromEntries(
    Object.entries(best).map(([kind, entry]) => [kind, entry.filePath]),
  );
}

// { poster: '/x.jpg', mobilePoster: … } con la imagen más votada de cada tipo;
// los tipos sin ningún voto no aparecen (el cliente usa su criterio automático).
export async function getCommunityArtwork({ mediaType, tmdbId }, executor = db) {
  const rows = await executor
    .select({
      kind: artworkVotes.kind,
      filePath: artworkVotes.filePath,
      votes: sql`COUNT(*)`.mapWith(Number),
      lastVotedAt: sql`MAX(${artworkVotes.updatedAt})`,
    })
    .from(artworkVotes)
    .where(and(eq(artworkVotes.mediaType, mediaType), eq(artworkVotes.tmdbId, Number(tmdbId))))
    .groupBy(artworkVotes.kind, artworkVotes.filePath)
    .orderBy(desc(sql`COUNT(*)`));
  return pickTopVotedArtwork(rows);
}
