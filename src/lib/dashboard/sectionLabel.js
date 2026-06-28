// Etiqueta superior (subtítulo en mayúsculas, a color) de cada fila de los
// dashboards (Inicio, Películas, Series).
//
// OBJETIVO: TODAS las filas tienen etiqueta y esta es REPRESENTATIVA del
// contenido. Los títulos llegan del motor del backend (algunos dinámicos:
// géneros y décadas), así que en vez de encadenar `if (title === ...)` en cada
// página —lo que dejaba filas sin etiqueta o con etiquetas sin sentido (p. ej.
// "GÉNERO" en "Lo mejor de los 1990")— centralizamos aquí la lógica:
//   1. Mapa exacto de los títulos conocidos (de backend/src/dashboard/surfaces).
//   2. "Porque te gustó X" → SIMILARES.
//   3. Décadas (4 o 2 dígitos) → "AÑOS 80 / 90 / 2000 / 2010 / 2020".
//   4. Filas de género (etiqueta = nombre del género) → GÉNERO.
//   5. Reserva → SELECCIÓN (ninguna fila se queda sin etiqueta).

// Nombres de género tal cual los emite el backend (MOVIE_GENRES / TV_GENRES en
// backend/src/dashboard/tmdb.js), más algunos habituales por robustez. Una fila
// cuyo título sea uno de estos es una fila "Por género".
const GENRE_LABELS = new Set([
  "Acción",
  "Aventura",
  "Animación",
  "Comedia",
  "Crimen",
  "Drama",
  "Fantasía",
  "Terror",
  "Misterio",
  "Romance",
  "Ciencia ficción",
  "Thriller",
  "Bélica",
  "Familia",
  "Western",
  "Acción y aventura",
  "Ciencia ficción y fantasía",
  "Documental",
  "Música",
  "Historia",
  "Suspense",
]);

// Título exacto → etiqueta representativa.
const EXACT_LABELS = {
  // Tendencias / popularidad
  Tendencias: "TENDENCIAS",
  "Tendencias ahora mismo": "TENDENCIAS",
  Populares: "POPULARES",
  "Lo que más se está viendo": "POPULARES",
  "Películas que todo el mundo está viendo": "POPULARES",
  "Series que se están viendo ahora": "POPULARES",
  "En emisión ahora mismo": "EN EMISIÓN",
  "En Emisión": "EN EMISIÓN",
  "Top 10 hoy en España": "TOP 10",
  "Populares en EE.UU.": "POPULARES",
  "En ascenso": "EN ASCENSO",

  // Esperadas / estrenos
  "Más esperadas": "ANTICIPADAS",
  Estrenos: "ESTRENOS",
  "Estrenos y novedades": "ESTRENOS",

  // Aclamadas / valoradas / premios
  "Aclamadas que merecen la pena": "ACLAMADAS",
  "Premiadas y aclamadas": "ACLAMADAS",
  "Premiadas y nominadas": "PREMIADAS",
  "Aclamadas por la crítica": "ACLAMADAS",
  "Series aclamadas para descubrir": "ACLAMADAS",
  "Mejor valoradas": "VALORADAS",
  "Las más valoradas": "VALORADAS",
  Infravaloradas: "INFRAVALORADAS",

  // Imprescindibles / éxitos
  "Taquillazos imprescindibles": "IMPRESCINDIBLES",
  "Series imprescindibles": "IMPRESCINDIBLES",
  "Grandes éxitos de siempre": "CLÁSICOS",
  "Películas de culto": "CULTO",
  Superéxito: "ÉXITOS",

  // Temáticas (acción, drama, etc.)
  "Acción y aventura con ritmo": "ACCIÓN",
  "Acción y aventura sin pausa": "ACCIÓN",
  "Series de acción y aventura": "ACCIÓN",
  "Dramas que enganchan": "DRAMA",
  "Dramas seriados que enganchan": "DRAMA",
  "Historias de venganza": "VENGANZA",
  "Fenómenos que todo el mundo comenta": "FENÓMENOS",

  // Descubrir / nostalgia
  "Joyas para descubrir": "DESCUBRIR",
  "Películas que quizá se te escaparon": "DESCUBRIR",
  "Series que quizá se te escaparon": "DESCUBRIR",
  "Una dosis de nostalgia": "NOSTALGIA",
  "Series para una dosis de nostalgia": "NOSTALGIA",
  "Favoritos de los 90 y 2000": "NOSTALGIA",

  // Colecciones por género / década
  "Por género": "GÉNEROS",
  "Imprescindibles por género": "GÉNEROS",
  "Por décadas": "DÉCADAS",
  "Imprescindibles de cada década": "DÉCADAS",

  // Personalizadas (home)
  "Recomendaciones de hoy para ti": "PARA TI",
  Recomendado: "PARA TI",
  Recomendados: "PARA TI",
  "Creemos que te van a encantar": "SUGERENCIAS",

  // Décadas concretas (la actual / atajos legacy)
  "Lo mejor de esta década": "AÑOS 2020",
  "Lo mejor de 2020": "AÑOS 2020",
};

// Devuelve la etiqueta de década a partir del año de inicio (80, 90, 2000…).
function decadeLabelFromYear(year) {
  if (year < 2000) return `AÑOS ${year % 100}`; // 1980 → "AÑOS 80", 1990 → "AÑOS 90"
  return `AÑOS ${year}`; // 2000/2010/2020 → "AÑOS 2000"…
}

// Detecta una década en el título ("Lo mejor de los 1990", "Clásicos de los 90",
// "Hits de 2010"…) y devuelve su etiqueta, o null si no hay década.
function decadeLabelFromTitle(title) {
  // 4 dígitos: 1950–2020.
  const four = title.match(/\b(19[5-9]0|20[0-2]0)\b/);
  if (four) return decadeLabelFromYear(Number(four[1]));
  // 2 dígitos tras "de los"/"los" (convención: 70/80/90 son 19xx).
  const two = title.match(/\blos (\d0)s?\b/i);
  if (two) {
    const n = Number(two[1]);
    return n >= 70 ? `AÑOS ${n}` : `AÑOS ${2000 + n}`;
  }
  return null;
}

// Etiqueta representativa para una fila de dashboard. Si la fila ya trae una
// etiqueta explícita (`providedLabel`), se respeta. Nunca devuelve null para un
// título con texto: como mínimo cae en "SELECCIÓN".
export function deriveSectionLabel(title, providedLabel = null) {
  if (providedLabel) return providedLabel;
  if (!title || typeof title !== "string") return null;
  const t = title.trim();
  if (!t) return null;

  if (EXACT_LABELS[t]) return EXACT_LABELS[t];

  if (/^Porque te gustó/i.test(t)) return "SIMILARES";

  const decade = decadeLabelFromTitle(t);
  if (decade) return decade;

  if (GENRE_LABELS.has(t)) return "GÉNERO";

  return "SELECCIÓN";
}
