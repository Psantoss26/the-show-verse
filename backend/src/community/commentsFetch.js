// backend/src/community/commentsFetch.js
//
// QUÉ COMENTARIOS DE TRAKT SE GUARDAN DE UN TÍTULO. Las pestañas de la sección
// (Top, Top del mes, Recientes) se calculan en PostgreSQL sobre lo guardado
// (ver tabs.js), así que cuantos más haya, mejor salen las tres.
//
//   - Por me gusta (`likes`), paginado de 100 en 100 hasta COMMENTS_MAX_PAGES:
//     un título con menos de 500 comentarios los guarda TODOS.
//   - Los más recientes (`newest`), primera página: con más de 500, que los
//     últimos estén aunque no lleguen al corte por me gusta.
//
// Solo la primera página por me gusta es imprescindible (sin ella no hay nada
// que guardar y se reintenta más tarde). Si falla otra página o la de
// recientes, se guarda lo conseguido en vez de perderlo todo.
//
// OJO con los criterios: Trakt solo admite newest, oldest, likes, replies,
// highest, lowest, plays y watched. Pedir uno que no existe (antes `likes_30`
// y `added`) responde 400, y con un fallo por criterio el sembrado entero se
// daba por fallido: los títulos se quedaban sin comentarios.

import { normalizeTraktComment } from './normalize.js';

export const COMMENTS_PAGE_SIZE = 100;
export const COMMENTS_MAX_PAGES = 5;

/**
 * Comentarios normalizados (filas de title_comments), sin repetir.
 * `getComments` es la de trakt.js: ({ type, traktId, sort, page, limit }) →
 * { ok, items, pagination: { pageCount } }.
 */
export async function collectTitleComments({ getComments, type, traktId, tmdbId, mediaType }) {
  const request = (sort, page) => getComments({ type, traktId, sort, page, limit: COMMENTS_PAGE_SIZE });

  const [first, newest] = await Promise.all([request('likes', 1), request('newest', 1)]);
  if (!first?.ok) throw new Error('trakt comments failed');

  const pageCount = Math.min(Number(first.pagination?.pageCount) || 1, COMMENTS_MAX_PAGES);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => request('likes', index + 2)),
  );

  const unique = new Map();
  for (const result of [first, ...rest, newest]) {
    if (!result?.ok) continue;
    for (const raw of result.items || []) {
      const row = normalizeTraktComment(raw, { tmdbId, mediaType });
      if (row) unique.set(row.externalId, row);
    }
  }
  return [...unique.values()];
}
