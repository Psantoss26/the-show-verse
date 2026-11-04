// /src/lib/userLists/advancedFilters.js
// Filtros avanzados de las páginas de usuario (Favoritos, Pendientes): rangos
// de puntuación (mía, IMDb, TMDb) y de año, géneros, plataformas y estado de
// visionado, más la agrupación «por veces vista». Lógica pura: la página le
// pasa de dónde sacar cada dato (notas IMDb, plataformas, visionados), que
// llegan por su cuenta y pueden no estar aún.
//
// Un filtro está ACTIVO solo cuando restringe algo: un rango completo (0–10,
// o todos los años de la lista) no cuenta, para que el indicador de la barra
// no se encienda sin motivo.

export const RATING_MIN = 0;
export const RATING_MAX = 10;
const FULL_RATING = [RATING_MIN, RATING_MAX];

// Plataformas canónicas de las páginas de usuario (mismas claves que
// getCanonicalProviders de Favoritos/Pendientes), en su orden de siempre.
export const ADVANCED_PROVIDER_OPTIONS = [
  { key: "netflix", label: "Netflix" },
  { key: "prime", label: "Prime Video" },
  { key: "hbo-max", label: "HBO Max" },
  { key: "crunchyroll", label: "Crunchyroll" },
  { key: "movistar", label: "Movistar +" },
  { key: "disney", label: "Disney +" },
  { key: "plex", label: "Plex" },
];
// Pseudo-plataforma: títulos sin ninguna de las anteriores.
export const NO_PROVIDER_KEY = "none";

export const WATCHED_OPTIONS = [
  { key: "all", label: "Todo" },
  { key: "watched", label: "Vistos" },
  { key: "unwatched", label: "Sin ver" },
  { key: "rewatched", label: "Vistos varias veces" },
];

const GENRE_NAMES = {
  28: "Acción",
  12: "Aventura",
  16: "Animación",
  35: "Comedia",
  80: "Crimen",
  99: "Documental",
  18: "Drama",
  10751: "Familiar",
  14: "Fantasía",
  36: "Historia",
  27: "Terror",
  10402: "Música",
  9648: "Misterio",
  10749: "Romance",
  878: "Ciencia ficción",
  10770: "Película de TV",
  53: "Suspense",
  10752: "Bélica",
  37: "Western",
  10759: "Acción y aventura",
  10762: "Infantil",
  10763: "Noticias",
  10764: "Reality",
  10765: "Ciencia ficción y fantasía",
  10766: "Telenovela",
  10767: "Talk show",
  10768: "Bélica y política",
};

// Duración: de la película o, en series, de un episodio (minutos). Barra de
// 0 a RUNTIME_MAX; el tope cuenta como «sin límite» (4 h o más). Los atajos
// ponen la barra en su tramo.
export const RUNTIME_MAX = 240;
const FULL_RUNTIME = [0, RUNTIME_MAX];
export const RUNTIME_OPTIONS = [
  { key: "lt30", label: "Menos de 30 min", range: [0, 30] },
  { key: "30-60", label: "30 min – 1 h", range: [30, 60] },
  { key: "60-90", label: "1 h – 1 h 30", range: [60, 90] },
  { key: "90-120", label: "1 h 30 – 2 h", range: [90, 120] },
  { key: "gt120", label: "Más de 2 h", range: [120, RUNTIME_MAX] },
];

// «45 min», «1 h 30», «4 h+» (el tope).
export function formatRuntimeMinutes(minutes) {
  if (minutes >= RUNTIME_MAX) return `${RUNTIME_MAX / 60} h+`;
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest ? `${Math.floor(minutes / 60)} h ${rest}` : `${minutes / 60} h`;
}

// Estado de TMDb de una serie (`status` de su ficha).
export const SERIES_STATUS_OPTIONS = [
  { key: "returning", label: "En emisión", match: ["returning series"] },
  { key: "ended", label: "Finalizada", match: ["ended"] },
  { key: "canceled", label: "Cancelada", match: ["canceled", "cancelled"] },
  { key: "upcoming", label: "Próximamente", match: ["in production", "planned", "pilot"] },
];

// Mínimo de votos en TMDb: quita los títulos con dos votos y nota 10. La
// barra avanza por estos escalones (escala casi logarítmica); los atajos son
// algunos de ellos.
export const VOTE_STEPS = [0, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000];
// «1.000», «25.000» (toLocaleString("es-ES") no separa las de 4 cifras).
export function formatVotes(value) {
  return String(Math.round(Number(value) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export const MIN_VOTES_OPTIONS = [
  { value: 0, label: "Cualquiera" },
  { value: 100, label: "100+" },
  { value: 1000, label: "1.000+" },
  { value: 10000, label: "10.000+" },
];

const DAY_MS = 86_400_000;
// Última vez visto, relativo a hoy.
export const LAST_WATCHED_OPTIONS = [
  { key: "any", label: "Cuando sea" },
  { key: "week", label: "Esta semana", maxDays: 7 },
  { key: "month", label: "Este mes", maxDays: 30 },
  { key: "half", label: "Últimos 6 meses", maxDays: 183 },
  { key: "older", label: "Hace más de 6 meses", minDays: 183 },
];

export const RELEASE_OPTIONS = [
  { key: "all", label: "Todo" },
  { key: "released", label: "Ya estrenados" },
  { key: "upcoming", label: "Sin estrenar" },
];

// Episodios que faltan (En progreso).
export const REMAINING_OPTIONS = [
  { key: "1-3", label: "1–3", min: 1, max: 3 },
  { key: "4-10", label: "4–10", min: 4, max: 10 },
  { key: "gt10", label: "Más de 10", min: 11, max: Infinity },
];

// Día de la semana (getDay: 0 = domingo), en orden de lunes a domingo.
export const WEEKDAY_OPTIONS = [
  { key: 1, label: "Lun" },
  { key: 2, label: "Mar" },
  { key: 3, label: "Mié" },
  { key: 4, label: "Jue" },
  { key: 5, label: "Vie" },
  { key: 6, label: "Sáb" },
  { key: 0, label: "Dom" },
];

export const DAY_PART_OPTIONS = [
  { key: "night", label: "Madrugada", from: 0, to: 6 },
  { key: "morning", label: "Mañana", from: 6, to: 14 },
  { key: "afternoon", label: "Tarde", from: 14, to: 20 },
  { key: "evening", label: "Noche", from: 20, to: 24 },
];

const FULL_PROGRESS = [0, 100];

export function createDefaultAdvancedFilters() {
  return {
    userRating: [...FULL_RATING],
    imdbRating: [...FULL_RATING],
    tmdbRating: [...FULL_RATING],
    traktRating: [...FULL_RATING],
    // null = sin límite (todos los años de la lista).
    yearRange: null,
    genres: [],
    providers: [],
    watched: "all",
    originalLanguages: [],
    runtimeRange: [...FULL_RUNTIME],
    seriesStatus: [],
    minVotes: 0,
    lastWatched: "any",
    release: "all",
    progress: [...FULL_PROGRESS],
    remaining: [],
    weekdays: [],
    dayParts: [],
  };
}

const keysOf = (options, key = "key") => new Set(options.map((option) => option[key]));
const STATUS_KEYS = keysOf(SERIES_STATUS_OPTIONS);
const VOTE_VALUES = new Set(VOTE_STEPS);
const LAST_WATCHED_KEYS = keysOf(LAST_WATCHED_OPTIONS);
const RELEASE_KEYS = keysOf(RELEASE_OPTIONS);
const REMAINING_KEYS = keysOf(REMAINING_OPTIONS);
const WEEKDAY_KEYS = keysOf(WEEKDAY_OPTIONS);
const DAY_PART_KEYS = keysOf(DAY_PART_OPTIONS);

function pickKnown(list, known, map = (value) => value) {
  return Array.isArray(list) ? [...new Set(list.map(map))].filter((value) => known.has(value)) : [];
}

function normalizeRange(value, fallback) {
  if (!Array.isArray(value) || value.length !== 2) return [...fallback];
  const [a, b] = value.map(Number);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return [...fallback];
  return [Math.min(a, b), Math.max(a, b)];
}

export function normalizeAdvancedFilters(raw) {
  const base = createDefaultAdvancedFilters();
  if (!raw || typeof raw !== "object") return base;
  return {
    userRating: normalizeRange(raw.userRating, FULL_RATING),
    imdbRating: normalizeRange(raw.imdbRating, FULL_RATING),
    tmdbRating: normalizeRange(raw.tmdbRating, FULL_RATING),
    yearRange: raw.yearRange == null ? null : normalizeRange(raw.yearRange, [0, 0]),
    // Ids de TMDb o, en las páginas que solo traen el nombre (En progreso),
    // el nombre del género.
    genres: Array.isArray(raw.genres)
      ? raw.genres
          .map((genre) =>
            typeof genre === "string" && !/^\d+$/.test(genre) ? genre : Number(genre),
          )
          .filter((genre) => typeof genre === "string" || (Number.isFinite(genre) && genre > 0))
      : [],
    providers: Array.isArray(raw.providers)
      ? raw.providers.filter((key) => typeof key === "string")
      : [],
    watched: WATCHED_OPTIONS.some((option) => option.key === raw.watched)
      ? raw.watched
      : "all",
    traktRating: normalizeRange(raw.traktRating, FULL_RATING),
    originalLanguages: Array.isArray(raw.originalLanguages)
      ? raw.originalLanguages.filter((code) => typeof code === "string" && code)
      : [],
    runtimeRange: (() => {
      const [a, b] = normalizeRange(raw.runtimeRange, FULL_RUNTIME);
      return [Math.max(0, a), Math.min(RUNTIME_MAX, b)];
    })(),
    seriesStatus: pickKnown(raw.seriesStatus, STATUS_KEYS),
    minVotes: VOTE_VALUES.has(Number(raw.minVotes)) ? Number(raw.minVotes) : 0,
    lastWatched: LAST_WATCHED_KEYS.has(raw.lastWatched) ? raw.lastWatched : "any",
    release: RELEASE_KEYS.has(raw.release) ? raw.release : "all",
    progress: normalizeRange(raw.progress, FULL_PROGRESS),
    remaining: pickKnown(raw.remaining, REMAINING_KEYS),
    weekdays: pickKnown(raw.weekdays, WEEKDAY_KEYS, Number),
    dayParts: pickKnown(raw.dayParts, DAY_PART_KEYS),
  };
}

export function readAdvancedFilters(storageKey) {
  if (typeof window === "undefined") return createDefaultAdvancedFilters();
  try {
    return normalizeAdvancedFilters(
      JSON.parse(window.localStorage.getItem(storageKey) || "null"),
    );
  } catch {
    return createDefaultAdvancedFilters();
  }
}

export function writeAdvancedFilters(storageKey, filters) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(filters));
  } catch {
    /* sin almacenamiento: los filtros duran lo que la visita */
  }
}

export function isRuntimeRangeActive(range) {
  return Array.isArray(range) && (range[0] > 0 || range[1] < RUNTIME_MAX);
}

export function isProgressRangeActive(range) {
  return Array.isArray(range) && (range[0] > 0 || range[1] < 100);
}

export function isRatingRangeActive(range) {
  return (
    Array.isArray(range) &&
    (range[0] > RATING_MIN || range[1] < RATING_MAX)
  );
}

export function getItemYear(item) {
  const year = Number(
    String(item?.release_date || item?.first_air_date || "").slice(0, 4),
  );
  return Number.isFinite(year) && year > 0 ? year : null;
}

// Años de la lista: los límites de la barra de año.
export function getYearBounds(items, getYear = getItemYear) {
  let min = Infinity;
  let max = -Infinity;
  for (const item of Array.isArray(items) ? items : []) {
    const year = getYear(item);
    if (year == null) continue;
    if (year < min) min = year;
    if (year > max) max = year;
  }
  return Number.isFinite(min) ? [min, max] : null;
}

// Rango de año efectivo (acotado a la lista) o null si no restringe nada.
export function getActiveYearRange(yearRange, yearBounds) {
  if (!yearRange || !yearBounds) return null;
  const from = Math.max(yearRange[0], yearBounds[0]);
  const to = Math.min(yearRange[1], yearBounds[1]);
  if (from <= yearBounds[0] && to >= yearBounds[1]) return null;
  return [from, to];
}

export function getGenreName(id) {
  if (typeof id === "string") return id;
  return GENRE_NAMES[id] || `Género ${id}`;
}

let languageNames = null;
// «ja» → «Japonés». Sin Intl.DisplayNames, el código en mayúsculas.
export function getLanguageName(code) {
  if (!code) return "";
  try {
    languageNames ??= new Intl.DisplayNames(["es"], { type: "language" });
    const name = languageNames.of(code);
    if (name && name !== code) return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    /* código no válido */
  }
  return String(code).toUpperCase();
}

const defaultGetLanguage = (item) => item?.original_language || null;

// Idiomas originales de la lista, con cuántos títulos tiene cada uno.
export function collectLanguageOptions(items, getLanguage = defaultGetLanguage) {
  const counts = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const code = getLanguage(item);
    if (code) counts.set(code, (counts.get(code) || 0) + 1);
  }
  return Array.from(counts, ([code, count]) => ({
    id: code,
    label: getLanguageName(code),
    count,
  })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

// Día de la semana y hora de un visionado, o null si la fecha no dice cuándo
// se vio de verdad (regla de backend/src/lib/yearInReviewCore.js):
//  - importados con solo fecha (00:00 o 12:00 UTC exactos): el día es el de
//    la fecha UTC y no hay hora;
//  - hora en punto exacta (minutos, segundos y ms a cero): sin hora;
//  - `bulk` (marcados en bloque, ≥3 visionados en el mismo instante): ni día
//    ni hora reales.
export function getWatchTimeParts(value, { bulk = false } = {}) {
  if (bulk || !value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const timeless =
    date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0;
  const dateOnly = timeless && (date.getUTCHours() === 0 || date.getUTCHours() === 12);
  return {
    weekday: dateOnly ? date.getUTCDay() : date.getDay(),
    hour: timeless ? null : date.getHours(),
  };
}

// Instantes repetidos ≥3 veces en una lista de visionados (marcados en bloque).
export function findBulkWatchInstants(entries, getWatchedAt = (entry) => entry?.watched_at) {
  const counts = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const value = getWatchedAt(entry);
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
  }
  const bulk = new Set();
  for (const [value, count] of counts) if (count >= 3) bulk.add(value);
  return bulk;
}

const defaultGetGenres = (item) =>
  Array.isArray(item?.genre_ids) ? item.genre_ids : [];

// Géneros presentes en la lista, con cuántos títulos tiene cada uno.
// `getGenres(item)`: ids (o nombres) de sus géneros.
export function collectGenreOptions(items, getGenres = defaultGetGenres) {
  const counts = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    for (const id of new Set(getGenres(item) || [])) {
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  }
  return Array.from(counts, ([id, count]) => ({
    id,
    label: getGenreName(id),
    count,
  })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function getAdvancedFilterNeeds(filters) {
  return {
    imdb: isRatingRangeActive(filters?.imdbRating),
    tmdb: isRatingRangeActive(filters?.tmdbRating),
    genres: (filters?.genres?.length || 0) > 0,
    userRatings: isRatingRangeActive(filters?.userRating),
    providers: (filters?.providers?.length || 0) > 0,
    watch:
      (filters?.watched && filters.watched !== "all") ||
      (filters?.lastWatched && filters.lastWatched !== "any"),
    trakt: isRatingRangeActive(filters?.traktRating),
    // Duración y estado salen de la ficha (title-meta) donde la lista no los trae.
    titleMeta:
      isRuntimeRangeActive(filters?.runtimeRange) || (filters?.seriesStatus?.length || 0) > 0,
    languages: (filters?.originalLanguages?.length || 0) > 0,
    votes: Number(filters?.minVotes) > 0,
  };
}

const formatRating = (value) =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

// Filtros activos como etiquetas cortas (resumen y contador de la barra).
export function listActiveAdvancedFilters(filters, { yearBounds = null } = {}) {
  if (!filters) return [];
  const active = [];
  const ratingLabel = (name, range) =>
    `${name} ${formatRating(range[0])}–${formatRating(range[1])}`;
  if (isRatingRangeActive(filters.userRating)) {
    active.push({ key: "userRating", label: ratingLabel("Mi nota", filters.userRating) });
  }
  if (isRatingRangeActive(filters.imdbRating)) {
    active.push({ key: "imdbRating", label: ratingLabel("IMDb", filters.imdbRating) });
  }
  if (isRatingRangeActive(filters.tmdbRating)) {
    active.push({ key: "tmdbRating", label: ratingLabel("TMDb", filters.tmdbRating) });
  }
  const years = getActiveYearRange(filters.yearRange, yearBounds);
  if (years) {
    active.push({
      key: "yearRange",
      label: years[0] === years[1] ? `${years[0]}` : `${years[0]}–${years[1]}`,
    });
  }
  if (filters.genres?.length) {
    active.push({
      key: "genres",
      label:
        filters.genres.length === 1
          ? getGenreName(filters.genres[0])
          : `${filters.genres.length} géneros`,
    });
  }
  if (filters.providers?.length) {
    active.push({
      key: "providers",
      label:
        filters.providers.length === 1
          ? filters.providers[0] === NO_PROVIDER_KEY
            ? "Sin plataforma"
            : ADVANCED_PROVIDER_OPTIONS.find((p) => p.key === filters.providers[0])
                ?.label || "1 plataforma"
          : `${filters.providers.length} plataformas`,
    });
  }
  if (filters.watched && filters.watched !== "all") {
    active.push({
      key: "watched",
      label: WATCHED_OPTIONS.find((o) => o.key === filters.watched)?.label,
    });
  }
  if (isRatingRangeActive(filters.traktRating)) {
    active.push({ key: "traktRating", label: ratingLabel("Trakt", filters.traktRating) });
  }
  const listLabel = (key, list, single, plural) => {
    if (!list?.length) return;
    active.push({ key, label: list.length === 1 ? single(list[0]) : plural(list.length) });
  };
  listLabel("originalLanguages", filters.originalLanguages, getLanguageName, (n) => `${n} idiomas`);
  const optionLabel = (options) => (key) => options.find((o) => o.key === key)?.label;
  if (isRuntimeRangeActive(filters.runtimeRange)) {
    const [from, to] = filters.runtimeRange;
    const preset = RUNTIME_OPTIONS.find((o) => o.range[0] === from && o.range[1] === to);
    active.push({
      key: "runtimeRange",
      label:
        preset?.label ||
        (to >= RUNTIME_MAX
          ? `${formatRuntimeMinutes(from)} o más`
          : `${formatRuntimeMinutes(from)} – ${formatRuntimeMinutes(to)}`),
    });
  }
  listLabel("seriesStatus", filters.seriesStatus, optionLabel(SERIES_STATUS_OPTIONS), (n) => `${n} estados`);
  if (Number(filters.minVotes) > 0) {
    active.push({
      key: "minVotes",
      label: `${formatVotes(filters.minVotes)}+ votos`,
    });
  }
  if (filters.lastWatched && filters.lastWatched !== "any") {
    active.push({
      key: "lastWatched",
      label: `Visto: ${optionLabel(LAST_WATCHED_OPTIONS)(filters.lastWatched)?.toLowerCase()}`,
    });
  }
  if (filters.release && filters.release !== "all") {
    active.push({ key: "release", label: optionLabel(RELEASE_OPTIONS)(filters.release) });
  }
  if (isProgressRangeActive(filters.progress)) {
    active.push({ key: "progress", label: `${filters.progress[0]}–${filters.progress[1]} %` });
  }
  listLabel(
    "remaining",
    filters.remaining,
    (key) => `Faltan ${optionLabel(REMAINING_OPTIONS)(key)?.toLowerCase()}`,
    (n) => `${n} tramos de episodios`,
  );
  listLabel(
    "weekdays",
    filters.weekdays,
    (key) => WEEKDAY_OPTIONS.find((o) => o.key === key)?.label,
    (n) => `${n} días`,
  );
  listLabel("dayParts", filters.dayParts, optionLabel(DAY_PART_OPTIONS), (n) => `${n} franjas`);
  return active;
}

function inRatingRange(value, range) {
  const rating = Number(value);
  if (!Number.isFinite(rating) || rating <= 0) return false;
  return rating >= range[0] && rating <= range[1];
}

const isMovieItem = (item) =>
  (item?.media_type || (item?.title ? "movie" : "tv")) === "movie";

function inOptionRange(value, options, keys) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return false;
  return options.some((option) => keys.has(option.key) && n >= option.min && n <= option.max);
}

/**
 * Aplica los filtros avanzados. Un filtro activo deja fuera los títulos de los
 * que aún no se sabe el dato (llegan después y la lista crece).
 *
 * ctx:
 *  - getUserRating, getImdbRating, getTraktRating(item): nota o null;
 *  - getProviders(item): array de plataformas canónicas, o undefined si aún
 *    no se conocen;
 *  - getWatchCount(item): visionados (en series, episodios vistos);
 *  - watchReady: el historial ya llegó. Hasta entonces los filtros de visto
 *    no se aplican, para no vaciar la lista y volver a llenarla;
 *  - yearBounds: límites de la barra de año;
 *  - getYear, getTmdbRating, getGenres, getOriginalLanguage, getVoteCount,
 *    getReleaseDate: en páginas cuyas entradas no traen release_date /
 *    vote_average / genre_ids / original_language / vote_count;
 *  - getRuntime(item): minutos; getSeriesStatus(item): `status` de TMDb;
 *  - getLastWatchedAt(item): fecha del último visionado;
 *  - getProgress(item): 0–100; getRemaining(item): episodios que faltan;
 *  - getWatchParts(item): { weekday, hour|null } (getWatchTimeParts) o null;
 *  - now: para «visto hace…» y «sin estrenar» (por defecto, ahora);
 *  - getMediaType(item): "movie" | "tv", en páginas cuyas entradas no traen
 *    `media_type` (Historial, En progreso: tienen `title` aunque sean series).
 */
export function applyAdvancedFilters(items, filters, ctx = {}) {
  if (!Array.isArray(items) || !filters) return items;
  const now = ctx.now ?? Date.now();
  const isMovie = ctx.getMediaType
    ? (item) => ctx.getMediaType(item) === "movie"
    : isMovieItem;
  const tests = [];
  const add = (active, test) => {
    if (active) tests.push(test);
  };

  add(isRatingRangeActive(filters.userRating), (item) =>
    inRatingRange(ctx.getUserRating?.(item), filters.userRating),
  );
  add(isRatingRangeActive(filters.imdbRating), (item) =>
    inRatingRange(ctx.getImdbRating?.(item), filters.imdbRating),
  );
  add(isRatingRangeActive(filters.tmdbRating), (item) =>
    inRatingRange(
      ctx.getTmdbRating ? ctx.getTmdbRating(item) : item?.vote_average,
      filters.tmdbRating,
    ),
  );
  add(isRatingRangeActive(filters.traktRating), (item) =>
    inRatingRange(ctx.getTraktRating?.(item), filters.traktRating),
  );

  const years = getActiveYearRange(filters.yearRange, ctx.yearBounds);
  add(years, (item) => {
    const year = (ctx.getYear || getItemYear)(item);
    return year != null && year >= years[0] && year <= years[1];
  });

  const genres = filters.genres?.length ? new Set(filters.genres) : null;
  add(genres, (item) =>
    ((ctx.getGenres || defaultGetGenres)(item) || []).some((id) => genres.has(id)),
  );

  const providers = filters.providers?.length ? new Set(filters.providers) : null;
  add(providers, (item) => {
    const list = ctx.getProviders?.(item);
    if (!Array.isArray(list)) return false;
    return list.length
      ? list.some((p) => providers.has(p?.platform_key))
      : providers.has(NO_PROVIDER_KEY);
  });

  const watchReady = ctx.watchReady !== false;
  const watched = filters.watched && filters.watched !== "all" && watchReady ? filters.watched : null;
  add(watched, (item) => {
    const count = Number(ctx.getWatchCount?.(item)) || 0;
    if (watched === "watched") return count > 0;
    if (watched === "unwatched") return count === 0;
    // En series el historial cuenta episodios, no vueltas a la serie: «varias
    // veces» solo distingue películas.
    return isMovie(item) && count >= 2;
  });

  const languages = filters.originalLanguages?.length ? new Set(filters.originalLanguages) : null;
  add(languages, (item) => languages.has((ctx.getOriginalLanguage || defaultGetLanguage)(item)));

  add(isRuntimeRangeActive(filters.runtimeRange), (item) => {
    const minutes = Number(ctx.getRuntime?.(item));
    if (!Number.isFinite(minutes) || minutes <= 0) return false;
    const [from, to] = filters.runtimeRange;
    return minutes >= from && (to >= RUNTIME_MAX || minutes <= to);
  });

  const statuses = filters.seriesStatus?.length
    ? new Set(
        SERIES_STATUS_OPTIONS.filter((o) => filters.seriesStatus.includes(o.key)).flatMap(
          (o) => o.match,
        ),
      )
    : null;
  // Solo series: las películas no tienen estado de emisión.
  add(statuses, (item) => {
    if (isMovie(item)) return false;
    const status = String(ctx.getSeriesStatus?.(item) || "").toLowerCase();
    return statuses.has(status);
  });

  const minVotes = Number(filters.minVotes) || 0;
  add(minVotes > 0, (item) => {
    const votes = Number(ctx.getVoteCount ? ctx.getVoteCount(item) : item?.vote_count);
    return Number.isFinite(votes) && votes >= minVotes;
  });

  const lastWatched =
    filters.lastWatched && filters.lastWatched !== "any" && watchReady
      ? LAST_WATCHED_OPTIONS.find((o) => o.key === filters.lastWatched)
      : null;
  add(lastWatched, (item) => {
    const time = Date.parse(ctx.getLastWatchedAt?.(item) || "");
    if (!Number.isFinite(time)) return false;
    const days = (now - time) / DAY_MS;
    if (lastWatched.maxDays != null && days > lastWatched.maxDays) return false;
    if (lastWatched.minDays != null && days <= lastWatched.minDays) return false;
    return true;
  });

  const release = filters.release && filters.release !== "all" ? filters.release : null;
  add(release, (item) => {
    const date = ctx.getReleaseDate
      ? ctx.getReleaseDate(item)
      : item?.release_date || item?.first_air_date;
    const time = Date.parse(date || "");
    // Sin fecha de estreno: aún no ha salido.
    const released = Number.isFinite(time) && time <= now;
    return release === "released" ? released : !released;
  });

  add(isProgressRangeActive(filters.progress), (item) => {
    const pct = Number(ctx.getProgress?.(item));
    return Number.isFinite(pct) && pct >= filters.progress[0] && pct <= filters.progress[1];
  });

  const remaining = filters.remaining?.length ? new Set(filters.remaining) : null;
  add(remaining, (item) => inOptionRange(ctx.getRemaining?.(item), REMAINING_OPTIONS, remaining));

  const weekdays = filters.weekdays?.length ? new Set(filters.weekdays) : null;
  add(weekdays, (item) => {
    const parts = ctx.getWatchParts?.(item);
    return parts != null && weekdays.has(parts.weekday);
  });

  const dayParts = filters.dayParts?.length
    ? DAY_PART_OPTIONS.filter((o) => filters.dayParts.includes(o.key))
    : null;
  add(dayParts, (item) => {
    const hour = ctx.getWatchParts?.(item)?.hour;
    return hour != null && dayParts.some((o) => hour >= o.from && hour < o.to);
  });

  if (!tests.length) return items;
  return items.filter((item) => tests.every((test) => test(item)));
}

// ---------- Agrupar por veces vista ----------
// Películas: por número de visionados. Series: el historial cuenta episodios,
// así que solo se distingue si se ha visto algo o nada.
export const WATCH_COUNT_GROUP_UNWATCHED = "wc_0";
export const WATCH_COUNT_GROUP_SHOWS = "wc_shows";

export function buildWatchCountGroupMeta(item, count) {
  const plays = Math.max(0, Number(count) || 0);
  if (plays === 0) return { key: WATCH_COUNT_GROUP_UNWATCHED, label: "Sin ver" };
  const isMovie = (item?.media_type || (item?.title ? "movie" : "tv")) === "movie";
  if (!isMovie) return { key: WATCH_COUNT_GROUP_SHOWS, label: "Series vistas" };
  return {
    key: `wc_${plays}`,
    label: plays === 1 ? "Vista 1 vez" : `Vista ${plays} veces`,
  };
}

// Más visionados primero; series vistas después de las películas y «Sin ver»
// al final.
export function sortWatchCountGroups(groups) {
  const rank = (key) => {
    if (key === WATCH_COUNT_GROUP_UNWATCHED) return -2;
    if (key === WATCH_COUNT_GROUP_SHOWS) return -1;
    return Number(String(key).slice(3)) || 0;
  };
  return groups.sort((a, b) => rank(b.key) - rank(a.key));
}
