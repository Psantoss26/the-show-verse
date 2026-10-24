// src/lib/realActivityInstant.js
// ¿La fecha de una fila de actividad es un instante real o la puso una
// importación? Lo comparten la actividad de los seguidos en una ficha
// (followingTitleActivity) y la página Hoy (todayActivity): las importaciones
// guardan solo el día (medianoche o mediodía UTC exactos) o muchas filas con el
// mismo instante, y esas fechas no pueden contarse como "hoy" ni "hace 3 días".

// Filas con el mismo instante a partir de las cuales es una importación.
export const BULK_GROUP_MIN = 3;

export function time(value) {
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * ¿La fecha es real? Las importaciones guardan solo el día (medianoche o
 * mediodía UTC exactos) o muchas filas con el mismo instante. Esas fechas no se
 * enseñan como "hace 3 días"; el estado (visto, favorito…) sí vale.
 */
export function isRealInstant(value, sameInstantCount = 1) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  if (sameInstantCount >= BULK_GROUP_MIN) return false;
  return !(date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0);
}

// Cuántas filas de esa persona comparten el instante. La consulta lo trae en
// `same` contando en TODA la tabla (una importación pone la misma fecha a cientos
// de títulos, y aquí solo llegan las filas de este); sin `same`, se cuenta en
// las filas recibidas.
// (OJO: en esas subconsultas las columnas de fuera van CUALIFICADAS a mano;
// Drizzle las escribe sin tabla y "user_id" se resolvería a la de dentro.)
export function countByInstant(rows, key = 'at') {
  const counts = new Map();
  for (const row of rows) {
    const t = time(row[key]);
    counts.set(`${row.userId}|${t}`, (counts.get(`${row.userId}|${t}`) || 0) + 1);
  }
  return (row) => Math.max(Number(row.same) || 0, counts.get(`${row.userId}|${time(row[key])}`) || 1);
}
