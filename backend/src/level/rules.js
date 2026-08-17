// backend/src/level/rules.js
// Pesos de XP por fuente de actividad. Módulo puro: recibe recuentos ya
// agregados (los produce stats.js) y devuelve el desglose.
//
// El XP se DERIVA del estado actual, no de un registro de eventos: el mismo
// historial siempre da el mismo XP, un reimport de Trakt no duplica nada y todo
// el historial previo cuenta de forma retroactiva sin script de relleno.

export const XP_WEIGHTS = Object.freeze({
  movies: 10,
  movieRewatches: 3,
  episodes: 2,
  completedShows: 25,
  ratings: 5,
  reviews: 40,
  longReviews: 20,      // bonus, se suma al peso de la reseña
  favorites: 3,
  watchlist: 1,
  lists: 15,
  listItems: 1,
  profileFavorites: 10,
  followers: 5,
  following: 2,
  likesReceived: 5,
  likesGiven: 1,
  activeDays: 5,
});

/**
 * Fuentes de XP en el orden en que se declaran.
 *
 * `countKey` es la clave del recuento dentro del objeto de estadísticas.
 * `derive` es opcional: si el recuento no viene dado, se calcula a partir de
 * otras estadísticas (así la capa SQL puede entregar los plays en bruto y no
 * tener que restar ella misma).
 */
export const XP_SOURCES = Object.freeze([
  { key: 'movies', countKey: 'movies', label: 'Películas vistas' },
  {
    key: 'movieRewatches',
    countKey: 'movieRewatches',
    label: 'Revisionados',
    derive: (stats) => Math.max(0, num(stats.moviePlays) - num(stats.movies)),
  },
  { key: 'episodes', countKey: 'episodes', label: 'Episodios vistos' },
  { key: 'completedShows', countKey: 'completedShows', label: 'Series completadas' },
  { key: 'ratings', countKey: 'ratings', label: 'Puntuaciones' },
  { key: 'reviews', countKey: 'reviews', label: 'Reseñas' },
  { key: 'longReviews', countKey: 'longReviews', label: 'Reseñas extensas' },
  { key: 'favorites', countKey: 'favorites', label: 'Favoritos' },
  { key: 'watchlist', countKey: 'watchlist', label: 'Pendientes' },
  { key: 'lists', countKey: 'lists', label: 'Listas creadas' },
  { key: 'listItems', countKey: 'listItems', label: 'Títulos en tus listas' },
  { key: 'profileFavorites', countKey: 'profileFavorites', label: 'Destacados del perfil' },
  { key: 'followers', countKey: 'followers', label: 'Seguidores' },
  { key: 'following', countKey: 'following', label: 'Miembros que sigues' },
  { key: 'likesReceived', countKey: 'likesReceived', label: 'Me gusta recibidos' },
  { key: 'likesGiven', countKey: 'likesGiven', label: 'Me gusta dados' },
  { key: 'activeDays', countKey: 'activeDays', label: 'Días con actividad' },
].map((source) => Object.freeze({ ...source, weight: XP_WEIGHTS[source.key] })));

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/** Estadísticas en blanco: una casilla por fuente, más los datos en bruto. */
export function emptyLevelStats() {
  const stats = {};
  for (const source of XP_SOURCES) stats[source.countKey] = 0;
  stats.moviePlays = 0;
  stats.watchDates = [];
  return stats;
}

/** Recuento de una fuente: el dado si existe, si no el derivado. */
function countForSource(source, stats) {
  const given = stats[source.countKey];
  if (given == null && typeof source.derive === 'function') {
    return num(source.derive(stats));
  }
  return num(given);
}

/**
 * Desglose de XP a partir de los recuentos agregados.
 *
 * Devuelve el total, un mapa por fuente (para tests y para la UI) y `earned`:
 * solo las fuentes que aportan algo, de mayor a menor, que es lo que pinta la
 * pestaña de Nivel.
 */
export function computeXpBreakdown(stats) {
  const input = stats && typeof stats === 'object' ? stats : {};
  const bySource = {};
  const earned = [];
  let total = 0;

  for (const source of XP_SOURCES) {
    const count = countForSource(source, input);
    const xp = count * source.weight;
    bySource[source.key] = { count, weight: source.weight, xp };
    total += xp;
    if (xp > 0) {
      earned.push({ key: source.key, label: source.label, count, weight: source.weight, xp });
    }
  }

  earned.sort((a, b) => b.xp - a.xp || a.key.localeCompare(b.key));
  return { total, bySource, earned };
}
