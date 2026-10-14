// Pestañas de la sección de comentarios y su orden. Todo se calcula en
// PostgreSQL sobre lo guardado (ver store.js:getCommentsPage).
//
//   - «Populares» (`popular`): por popularidad = me gusta + respuestas.
//   - «Recientes» (`recent`): por fecha, los más nuevos primero.
//   - «Ordenar por likes» (`sort=likes`) reordena la pestaña por me gusta. En
//     Recientes se queda con los RECIENTES (últimos 30 días, o al menos los
//     RECENT_MIN_COMMENTS más nuevos si hay pocos) para no convertirse en
//     otra lista de populares.
//
// Los nombres antiguos siguen funcionando (enlaces y clientes en caché):
// top / likesAll → Populares; top30 / likes30 → Recientes por likes.

export const RECENT_WINDOW_DAYS = 30;
export const RECENT_MIN_COMMENTS = 50;

export function resolveCommentTab(tab, sort) {
  const t = String(tab || '').toLowerCase();
  const byLikes = String(sort || '').toLowerCase() === 'likes';
  if (t === 'top30' || t === 'likes30') return { tab: 'recent', order: 'likes', recentWindow: true };
  if (t === 'recent' || t === 'newest') {
    return byLikes
      ? { tab: 'recent', order: 'likes', recentWindow: true }
      : { tab: 'recent', order: 'recent', recentWindow: false };
  }
  // popular / top / likesAll / por defecto
  return { tab: 'popular', order: byLikes ? 'likes' : 'popularity', recentWindow: false };
}
