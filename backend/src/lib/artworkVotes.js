// Votos de artwork: la selección de «Portadas y fondos» de cada usuario cuenta
// como un voto por su imagen, y la más votada pasa a ser la imagen por defecto
// del título para todo el mundo (con o sin sesión).
//
// Un usuario = un voto por título y tipo de imagen: la fila guarda su selección
// ACTUAL, así que cambiar de imagen mueve el voto y restablecer lo retira. La
// selección propia sigue mandando sobre la de la comunidad en el cliente.

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { artworkVotes } from '../db/schema.js';

export const ARTWORK_VOTE_KINDS = ['poster', 'mobilePoster', 'backdrop', 'background', 'logo', 'cardBackdrop'];

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

// Lo mismo para VARIOS títulos de un tipo a la vez (filas con `tmdbId`):
// { [tmdbId]: { poster: … } }. Los títulos sin votos no aparecen.
export function pickTopVotedArtworkByTitle(rows) {
  const byTitle = new Map();
  for (const row of rows || []) {
    const id = Number(row?.tmdbId);
    if (!Number.isInteger(id)) continue;
    if (!byTitle.has(id)) byTitle.set(id, []);
    byTitle.get(id).push(row);
  }
  const result = {};
  for (const [id, titleRows] of byTitle) {
    const artwork = pickTopVotedArtwork(titleRows);
    if (Object.keys(artwork).length) result[id] = artwork;
  }
  return result;
}

// Pósters más votados de varias TEMPORADAS (id de TMDb de la temporada, el de
// `artworkOverrides["season:<id>"]`): { [seasonId]: '/x.jpg' }. Una consulta
// para todas las tarjetas de «Temporadas» de una serie.
export async function getCommunitySeasonPosters(seasonIds, executor = db) {
  const ids = [...new Set((seasonIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return {};
  const rows = await executor
    .select({
      tmdbId: artworkVotes.tmdbId,
      kind: artworkVotes.kind,
      filePath: artworkVotes.filePath,
      votes: sql`COUNT(*)`.mapWith(Number),
      lastVotedAt: sql`MAX(${artworkVotes.updatedAt})`,
    })
    .from(artworkVotes)
    .where(and(
      eq(artworkVotes.mediaType, 'season'),
      eq(artworkVotes.kind, 'poster'),
      inArray(artworkVotes.tmdbId, ids),
    ))
    .groupBy(artworkVotes.tmdbId, artworkVotes.kind, artworkVotes.filePath);
  return Object.fromEntries(
    Object.entries(pickTopVotedArtworkByTitle(rows)).map(([id, artwork]) => [id, artwork.poster]),
  );
}

// Más votadas de VARIOS títulos de un tipo (`movie`, `tv` o `collection`) a la
// vez: { [tmdbId]: { poster, cardBackdrop, … } }, solo los títulos y tipos de
// imagen con algún voto. Las tarjetas de las páginas montan por decenas y van
// en una sola consulta. `kinds` limita los tipos de imagen (todos sin él).
export async function getCommunityArtworkForTitles({ mediaType, tmdbIds, kinds }, executor = db) {
  const ids = [...new Set((tmdbIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return {};
  const kindList = (kinds || []).filter((kind) => ARTWORK_VOTE_KINDS.includes(kind));
  const rows = await executor
    .select({
      tmdbId: artworkVotes.tmdbId,
      kind: artworkVotes.kind,
      filePath: artworkVotes.filePath,
      votes: sql`COUNT(*)`.mapWith(Number),
      lastVotedAt: sql`MAX(${artworkVotes.updatedAt})`,
    })
    .from(artworkVotes)
    .where(and(
      eq(artworkVotes.mediaType, mediaType),
      inArray(artworkVotes.tmdbId, ids),
      ...(kindList.length ? [inArray(artworkVotes.kind, kindList)] : []),
    ))
    .groupBy(artworkVotes.tmdbId, artworkVotes.kind, artworkVotes.filePath);
  return pickTopVotedArtworkByTitle(rows);
}
