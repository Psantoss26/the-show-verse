// Resultados de búsqueda de TMDb reducidos a lo que necesita el buscador de la
// corrección de detecciones en la app Android: solo películas y series, sin
// duplicados y con los campos ya planos (la app los pinta tal cual).

export function normalizeTitleSearch(results, limit = 20) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(results) ? results : []) {
    const mediaType = item?.media_type === 'movie' || item?.media_type === 'tv' ? item.media_type : null;
    const id = Number(item?.id);
    const title = String(item?.title || item?.name || '').trim();
    if (!mediaType || !Number.isInteger(id) || id <= 0 || !title) continue;
    const key = `${mediaType}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const date = String(item.release_date || item.first_air_date || '');
    out.push({
      tmdbId: id,
      mediaType,
      title,
      year: /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null,
      posterPath: item.poster_path || null,
    });
    if (out.length >= limit) break;
  }
  return out;
}
