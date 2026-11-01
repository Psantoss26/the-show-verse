// Recuentos de la cabecera de /social por sección (Siguiendo y Yo), sin base
// de datos: `getSocialSummary` (userProfile.js) trae las filas de la ventana y
// aquí se cuentan, para poder probarlo con Node.
//
// Cada fila es `{ userId, tmdbId, mediaType, activityGroup, at }`, una por
// evento de las mismas fuentes que «Activos» (reseñas, vistos, pendientes,
// favoritos, puntuaciones, listas públicas y sus elementos).

// Las puntuaciones de temporada o episodio cuentan como su serie.
function titleOf(row) {
  if (!row?.tmdbId || !row.mediaType) return null;
  const type = row.mediaType === 'season' || row.mediaType === 'episode' ? 'tv' : row.mediaType;
  return `${type}:${row.tmdbId}`;
}

// Día local (AAAA-MM-DD) de una fecha en la zona horaria del usuario.
function localDay(at, timeZone) {
  const date = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'UTC' }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/**
 * Actividades de las filas, contadas como en el feed: los episodios vistos
 * juntos (mismo `activityGroup`, p. ej. «marcar temporada») son UN evento.
 */
export function countActions(rows) {
  const groups = new Set();
  let singles = 0;
  for (const row of rows || []) {
    if (row?.activityGroup) groups.add(`${row.userId}|${row.activityGroup}`);
    else singles += 1;
  }
  return singles + groups.size;
}

/** Siguiendo: actividades de la ventana, cuentas seguidas y cuántas se han movido. */
export function summarizeFollowingWindow(rows, followingCount) {
  const active = new Set();
  for (const row of rows || []) if (row?.userId) active.add(row.userId);
  return {
    actions: countActions(rows),
    people: Number(followingCount) || 0,
    active: active.size,
  };
}

/** Yo: actividades de la ventana, títulos distintos tocados y días con algo hecho. */
export function summarizeOwnWindow(rows, timeZone) {
  const titles = new Set();
  const days = new Set();
  for (const row of rows || []) {
    const title = titleOf(row);
    if (title) titles.add(title);
    const day = localDay(row?.at, timeZone);
    if (day) days.add(day);
  }
  return {
    actions: countActions(rows),
    titles: titles.size,
    days: days.size,
  };
}
