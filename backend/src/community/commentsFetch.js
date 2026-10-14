// backend/src/community/commentsFetch.js
//
// QUÉ COMENTARIOS DE TRAKT SE GUARDAN DE UN TÍTULO. Las pestañas de la sección
// (Populares, Recientes) se calculan en PostgreSQL sobre lo guardado (ver
// tabs.js).
//
//   - PREFERENCIA, LOS POPULARES: por me gusta (`likes`), paginado de 100 en
//     100 hasta COMMENTS_MAX_PAGES.
//   - Y UNOS POCOS RECIENTES (`newest`, COMMENTS_RECENT_COUNT), para que la
//     pestaña Recientes tenga lo último aunque no llegue al corte por me gusta.
//   - SOLO EN INGLÉS O ESPAÑOL (commentLanguage.js): Trakt no filtra por
//     idioma; el resto no se guarda.
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
import { isCommentLanguageShown } from './commentLanguage.js';

export const COMMENTS_PAGE_SIZE = 100;
export const COMMENTS_MAX_PAGES = 5;
export const COMMENTS_RECENT_COUNT = 20;

/**
 * Comentarios normalizados (filas de title_comments), sin repetir.
 * `getComments` es la de trakt.js: ({ type, traktId, sort, page, limit }) →
 * { ok, items, pagination: { pageCount } }.
 */
export async function collectTitleComments({ getComments, type, traktId, tmdbId, mediaType }) {
  const request = (sort, page, limit = COMMENTS_PAGE_SIZE) => getComments({ type, traktId, sort, page, limit });

  const [first, newest] = await Promise.all([
    request('likes', 1),
    request('newest', 1, COMMENTS_RECENT_COUNT),
  ]);
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
      if (row && isCommentLanguageShown(row.lang)) unique.set(row.externalId, row);
    }
  }
  return [...unique.values()];
}
