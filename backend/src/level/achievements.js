// backend/src/level/achievements.js
// Catálogo de logros y su evaluación. Módulo puro.
//
// Cada logro es declarativo: una métrica y un umbral. Así la UI puede pintar el
// avance ("47/50") sin lógica propia y añadir un logro nuevo es una línea.
//
// La evaluación es idempotente y se recalcula en cada lectura; lo que se
// persiste (en user_achievements) es la FECHA del primer desbloqueo, para que un
// logro conseguido no se pierda si el usuario borra favoritos después.

export const ACHIEVEMENT_FAMILIES = Object.freeze([
  'visionado',
  'series',
  'critica',
  'coleccion',
  'social',
  'constancia',
  'rareza',
]);

export const ACHIEVEMENT_RARITIES = Object.freeze(['comun', 'raro', 'epico', 'legendario']);

const CATALOG = [
  // ── Visionado ──────────────────────────────
  { id: 'primera-pelicula', name: 'Primera función', description: 'Marca tu primera película como vista.', family: 'visionado', rarity: 'comun', icon: 'ticket', metric: 'movies', threshold: 1 },
  { id: 'diez-peliculas', name: 'Sesión doble', description: '10 películas vistas.', family: 'visionado', rarity: 'comun', icon: 'film', metric: 'movies', threshold: 10 },
  { id: 'cincuenta-peliculas', name: 'Abonado', description: '50 películas vistas.', family: 'visionado', rarity: 'comun', icon: 'film', metric: 'movies', threshold: 50 },
  { id: 'cien-peliculas', name: 'Centenario', description: '100 películas vistas.', family: 'visionado', rarity: 'raro', icon: 'clapperboard', metric: 'movies', threshold: 100 },
  { id: 'doscientas-cincuenta-peliculas', name: 'Filmoteca', description: '250 películas vistas.', family: 'visionado', rarity: 'epico', icon: 'clapperboard', metric: 'movies', threshold: 250 },
  { id: 'quinientas-peliculas', name: 'Proyeccionista', description: '500 películas vistas.', family: 'visionado', rarity: 'legendario', icon: 'projector', metric: 'movies', threshold: 500 },

  // ── Series ─────────────────────────────────
  { id: 'primer-episodio', name: 'Piloto', description: 'Ve tu primer episodio.', family: 'series', rarity: 'comun', icon: 'tv', metric: 'episodes', threshold: 1 },
  { id: 'cien-episodios', name: 'Temporada tras temporada', description: '100 episodios vistos.', family: 'series', rarity: 'comun', icon: 'tv', metric: 'episodes', threshold: 100 },
  { id: 'quinientos-episodios', name: 'Maratoniano', description: '500 episodios vistos.', family: 'series', rarity: 'raro', icon: 'tv', metric: 'episodes', threshold: 500 },
  { id: 'mil-episodios', name: 'Sin final', description: '1000 episodios vistos.', family: 'series', rarity: 'legendario', icon: 'infinity', metric: 'episodes', threshold: 1000 },
  { id: 'primera-serie-completada', name: 'Créditos finales', description: 'Completa tu primera serie.', family: 'series', rarity: 'comun', icon: 'check-circle', metric: 'completedShows', threshold: 1 },
  { id: 'cinco-series-completadas', name: 'Coleccionista de finales', description: 'Completa 5 series.', family: 'series', rarity: 'raro', icon: 'check-circle', metric: 'completedShows', threshold: 5 },
  { id: 'veinticinco-series-completadas', name: 'Archivo cerrado', description: 'Completa 25 series.', family: 'series', rarity: 'epico', icon: 'library', metric: 'completedShows', threshold: 25 },

  // ── Crítica ────────────────────────────────
  { id: 'primera-puntuacion', name: 'Primera nota', description: 'Puntúa un título.', family: 'critica', rarity: 'comun', icon: 'star', metric: 'ratings', threshold: 1 },
  { id: 'diez-puntuaciones', name: 'Con criterio', description: 'Puntúa 10 títulos.', family: 'critica', rarity: 'comun', icon: 'star', metric: 'ratings', threshold: 10 },
  { id: 'cien-puntuaciones', name: 'Jurado', description: 'Puntúa 100 títulos.', family: 'critica', rarity: 'raro', icon: 'star', metric: 'ratings', threshold: 100 },
  { id: 'trescientas-puntuaciones', name: 'Palmarés propio', description: 'Puntúa 300 títulos.', family: 'critica', rarity: 'epico', icon: 'award', metric: 'ratings', threshold: 300 },
  { id: 'primera-resena', name: 'Toma la palabra', description: 'Escribe tu primera reseña.', family: 'critica', rarity: 'comun', icon: 'pen', metric: 'reviews', threshold: 1 },
  { id: 'diez-resenas', name: 'Columnista', description: 'Escribe 10 reseñas.', family: 'critica', rarity: 'raro', icon: 'pen', metric: 'reviews', threshold: 10 },
  { id: 'resena-extensa', name: 'Sin resumir', description: 'Escribe una reseña de más de 300 caracteres.', family: 'critica', rarity: 'comun', icon: 'scroll', metric: 'longReviews', threshold: 1 },

  // ── Colección ──────────────────────────────
  { id: 'primer-favorito', name: 'Flechazo', description: 'Añade tu primer favorito.', family: 'coleccion', rarity: 'comun', icon: 'heart', metric: 'favorites', threshold: 1 },
  { id: 'cincuenta-favoritos', name: 'Buen gusto', description: '50 favoritos.', family: 'coleccion', rarity: 'comun', icon: 'heart', metric: 'favorites', threshold: 50 },
  { id: 'doscientos-favoritos', name: 'Corazón sin filtro', description: '200 favoritos.', family: 'coleccion', rarity: 'raro', icon: 'heart', metric: 'favorites', threshold: 200 },
  { id: 'primera-lista', name: 'Curador', description: 'Crea tu primera lista.', family: 'coleccion', rarity: 'comun', icon: 'list', metric: 'lists', threshold: 1 },
  { id: 'lista-cincuenta', name: 'Lista de autor', description: 'Reúne 50 títulos en una misma lista.', family: 'coleccion', rarity: 'raro', icon: 'list', metric: 'largestList', threshold: 50 },
  { id: 'perfil-curado', name: 'Escaparate', description: 'Elige los 10 destacados de tu perfil.', family: 'coleccion', rarity: 'raro', icon: 'sparkles', metric: 'profileFavorites', threshold: 10 },

  // ── Social ─────────────────────────────────
  { id: 'primer-seguidor', name: 'No estás solo', description: 'Consigue tu primer seguidor.', family: 'social', rarity: 'comun', icon: 'user-plus', metric: 'followers', threshold: 1 },
  { id: 'diez-seguidores', name: 'Con público', description: '10 seguidores.', family: 'social', rarity: 'raro', icon: 'users', metric: 'followers', threshold: 10 },
  { id: 'sociable', name: 'Sociable', description: 'Sigue a 10 miembros.', family: 'social', rarity: 'comun', icon: 'user-check', metric: 'following', threshold: 10 },
  { id: 'veinticinco-me-gusta', name: 'Voz autorizada', description: 'Recibe 25 me gusta.', family: 'social', rarity: 'epico', icon: 'thumbs-up', metric: 'likesReceived', threshold: 25 },

  // ── Constancia ─────────────────────────────
  { id: 'racha-siete', name: 'Semana perfecta', description: '7 días seguidos con actividad.', family: 'constancia', rarity: 'comun', icon: 'flame', metric: 'longestStreak', threshold: 7 },
  { id: 'racha-treinta', name: 'Mes en cartelera', description: '30 días seguidos con actividad.', family: 'constancia', rarity: 'raro', icon: 'flame', metric: 'longestStreak', threshold: 30 },
  { id: 'racha-cien', name: 'Inasequible', description: '100 días seguidos con actividad.', family: 'constancia', rarity: 'legendario', icon: 'flame', metric: 'longestStreak', threshold: 100 },
  { id: 'anio-activo', name: 'Butaca fija', description: '365 días con actividad.', family: 'constancia', rarity: 'epico', icon: 'calendar', metric: 'activeDays', threshold: 365 },

  // ── Rareza ─────────────────────────────────
  { id: 'maraton', name: 'Maratón', description: '5 películas vistas en un mismo día.', family: 'rareza', rarity: 'raro', icon: 'zap', metric: 'bestMovieDay', threshold: 5 },
  { id: 'trasnochador', name: 'Trasnochador', description: '10 visionados entre medianoche y las 5.', family: 'rareza', rarity: 'raro', icon: 'moon', metric: 'lateNightWatches', threshold: 10 },
  { id: 'veterano', name: 'Veterano', description: 'Alcanza el nivel 20.', family: 'rareza', rarity: 'epico', icon: 'shield', metric: 'level', threshold: 20 },
  { id: 'leyenda-viva', name: 'Leyenda viva', description: 'Alcanza el nivel 36.', family: 'rareza', rarity: 'legendario', icon: 'crown', metric: 'level', threshold: 36 },
];

export const ACHIEVEMENTS = Object.freeze(CATALOG.map((a) => Object.freeze(a)));

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/**
 * Métricas planas sobre las que se evalúan los umbrales: los recuentos de
 * actividad más el nivel y las rachas.
 */
export function buildAchievementMetrics(context = {}) {
  const stats = context?.stats && typeof context.stats === 'object' ? context.stats : {};
  const streaks = context?.streaks && typeof context.streaks === 'object' ? context.streaks : {};

  return {
    movies: num(stats.movies),
    movieRewatches: Math.max(0, num(stats.moviePlays) - num(stats.movies)),
    episodes: num(stats.episodes),
    completedShows: num(stats.completedShows),
    ratings: num(stats.ratings),
    reviews: num(stats.reviews),
    longReviews: num(stats.longReviews),
    favorites: num(stats.favorites),
    watchlist: num(stats.watchlist),
    lists: num(stats.lists),
    listItems: num(stats.listItems),
    largestList: num(stats.largestList),
    profileFavorites: num(stats.profileFavorites),
    followers: num(stats.followers),
    following: num(stats.following),
    likesReceived: num(stats.likesReceived),
    likesGiven: num(stats.likesGiven),
    bestMovieDay: num(stats.bestMovieDay),
    lateNightWatches: num(stats.lateNightWatches),
    level: num(context.level),
    currentStreak: num(streaks.current),
    longestStreak: num(streaks.longest),
    activeDays: num(streaks.activeDays ?? stats.activeDays),
  };
}

/**
 * Evalúa el catálogo completo.
 *
 * Devuelve `unlocked` (ids conseguidos) e `items` (catálogo entero con avance),
 * en el orden de declaración para que la rejilla de la UI no baile.
 */
export function evaluateAchievements(context = {}) {
  const metrics = buildAchievementMetrics(context);
  const unlocked = [];
  const items = ACHIEVEMENTS.map((achievement) => {
    const current = metrics[achievement.metric] ?? 0;
    const isUnlocked = current >= achievement.threshold;
    if (isUnlocked) unlocked.push(achievement.id);
    return {
      ...achievement,
      unlocked: isUnlocked,
      progress: {
        current: Math.min(current, achievement.threshold),
        threshold: achievement.threshold,
        percent: Math.min(100, Math.round((current / achievement.threshold) * 100)),
      },
    };
  });

  return { unlocked, items, metrics };
}
