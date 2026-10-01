// Modelo PURO de "Tu año en The Show Verse": qué pantallas se enseñan según
// los datos del año, cuánto dura cada una, su paleta y qué banda sonora suena.
// Sin React, para poder probarlo con node:test.

const TMDB_IMG = "https://image.tmdb.org/t/p";

export function tmdbImg(path, size = "w342") {
  if (!path || typeof path !== "string") return null;
  if (/^https?:\/\//.test(path)) return path;
  return `${TMDB_IMG}/${size}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Arte de FONDO de un título: siempre sin idioma (sin texto). Primero el
 * póster textless, que encaja en el marco vertical; si no hay, el fondo
 * apaisado textless; si tampoco, ninguno (nunca un arte con texto). Los
 * calcula el backend (attachBackgrounds en yearInReviewCore.js).
 */
export function backgroundArt(card) {
  if (card?.textlessPosterPath) return { kind: "poster", path: card.textlessPosterPath };
  if (card?.textlessBackdropPath) return { kind: "backdrop", path: card.textlessBackdropPath };
  return null;
}

/** URL de un fondo a la talla adecuada (póster vertical o fondo apaisado). */
export function backgroundUrl(card, { large = false } = {}) {
  const art = backgroundArt(card);
  if (!art) return null;
  if (art.kind === "poster") return tmdbImg(art.path, large ? "original" : "w780");
  return tmdbImg(art.path, large ? "original" : "w1280");
}

const numberFormatter = new Intl.NumberFormat("es-ES");

export function formatNumber(value) {
  return numberFormatter.format(Math.round(Number(value) || 0));
}

export function formatDecimal(value, digits = 1) {
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value) || 0);
}

/** "12 de marzo" (sin año) a partir de 'YYYY-MM-DD', sin depender del huso del visitante. */
export function formatDay(dayKey, { weekday = false } = {}) {
  if (!dayKey) return "";
  const [y, m, d] = String(dayKey).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    ...(weekday ? { weekday: "long" } : {}),
    timeZone: "UTC",
  }).format(date);
}

export function formatHours(minutes) {
  const hours = Number(minutes || 0) / 60;
  return hours >= 10 ? formatNumber(hours) : formatDecimal(hours, 1);
}

/** Bandera emoji a partir de un código ISO 3166-1 alfa-2. */
export function flagEmoji(code) {
  if (!/^[A-Z]{2}$/i.test(String(code || ""))) return "";
  return String(code)
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

/** Equivalencias de tiempo, para que una cifra enorme se entienda. */
export function minutesEquivalences(minutes) {
  const m = Number(minutes) || 0;
  const items = [];
  if (m >= 60 * 24) items.push({ id: "days", value: m / 1440, label: "días enteros sin pausa" });
  if (m >= 172) items.push({ id: "lotr", value: m / 558, label: "veces la trilogía de El Señor de los Anillos (versión cine)" });
  if (m >= 60 * 12) items.push({ id: "flights", value: m / (60 * 12.5), label: "vuelos Madrid–Tokio" });
  return items.filter((item) => item.value >= 1);
}

// ─────────────────────────────────────────────
// Paletas (estilo Wrapped: colores planos y saturados, tipografía enorme)
// ─────────────────────────────────────────────

export const RECAP_THEMES = Object.freeze({
  night: { bg: "#08080c", fg: "#ffffff", accent: "#c6f432", accent2: "#ff4fa3", muted: "rgba(255,255,255,0.68)" },
  lime: { bg: "#c6f432", fg: "#0b0b0b", light: true, accent: "#5b2bff", accent2: "#ff4fa3", muted: "rgba(11,11,11,0.7)" },
  pink: { bg: "#ff4fa3", fg: "#1a0010", light: true, accent: "#ffe14d", accent2: "#5b2bff", muted: "rgba(26,0,16,0.72)" },
  violet: { bg: "#4a1fe0", fg: "#ffffff", accent: "#ffd23f", accent2: "#c6f432", muted: "rgba(255,255,255,0.72)" },
  orange: { bg: "#ff6b1a", fg: "#1a0800", light: true, accent: "#fff3d6", accent2: "#4a1fe0", muted: "rgba(26,8,0,0.72)" },
  cyan: { bg: "#1fd1ec", fg: "#03181d", light: true, accent: "#ff4fa3", accent2: "#08080c", muted: "rgba(3,24,29,0.72)" },
  red: { bg: "#e5233b", fg: "#ffffff", accent: "#ffe14d", accent2: "#08080c", muted: "rgba(255,255,255,0.75)" },
  cream: { bg: "#f4ecd8", fg: "#17120a", light: true, accent: "#e5233b", accent2: "#4a1fe0", muted: "rgba(23,18,10,0.7)" },
  navy: { bg: "#0c1846", fg: "#ffffff", accent: "#ff4fa3", accent2: "#1fd1ec", muted: "rgba(255,255,255,0.7)" },
  emerald: { bg: "#0d4d33", fg: "#effff7", accent: "#c6f432", accent2: "#ffd23f", muted: "rgba(239,255,247,0.72)" },
  cinema: { bg: "#050505", fg: "#ffffff", accent: "#ffd23f", accent2: "#e5233b", muted: "rgba(255,255,255,0.72)" },
});

// ─────────────────────────────────────────────
// Pantallas
// ─────────────────────────────────────────────

const SECONDS = 1000;

function hasItems(list, min = 1) {
  return Array.isArray(list) && list.length >= min;
}

/**
 * Lista ordenada de pantallas para un resumen. Cada una: { id, theme, duration,
 * label, sound } donde `sound` es la clave del título cuya banda sonora suena.
 * Las pantallas sin datos suficientes se omiten (mejor 12 pantallas con
 * sentido que 18 con huecos).
 */
export function buildRecapSlides(recap) {
  if (!recap || recap.empty || !recap.totals) return [];
  const slides = [];
  const topShow = recap.shows?.top?.[0] || null;
  const topMovie = recap.movies?.top?.[0] || null;
  const yearSound = recap.topTitle?.key || topShow?.key || topMovie?.key || null;
  // Cada pantalla suena con su título más representativo (lo reparte el
  // backend: assignSoundtracks en yearInReviewCore.js). Sin ese reparto
  // (resúmenes en caché de una versión anterior), el título indicado aquí.
  const bySlide = recap.soundtrack?.bySlide || {};
  const add = (id, theme, duration, label, fallback = yearSound) =>
    slides.push({ id, theme, duration, label, sound: bySlide[id] || fallback });

  add("intro", "night", null, `Tu ${recap.year} en The Show Verse`);
  add("minutes", "lime", 9 * SECONDS, "Tiempo total");
  add("split", "violet", 9 * SECONDS, "Películas y series");
  if (recap.firstOfYear && recap.lastOfYear && recap.firstOfYear.key !== recap.lastOfYear.key) {
    add("bookends", "cream", 9 * SECONDS, "Primero y último");
  }
  if (hasItems(recap.genres?.top)) add("genres", "pink", 10 * SECONDS, "Tus géneros");
  if (topShow) {
    add("topShow", "cinema", 11 * SECONDS, "Tu serie del año", topShow.key);
    if (hasItems(recap.shows.top, 2)) add("topShows", "navy", 10 * SECONDS, "Top series", topShow.key);
  }
  if (topMovie) {
    add("topMovie", "cinema", 11 * SECONDS, "Tu película del año", topMovie.key);
    if (hasItems(recap.movies.top, 2)) add("topMovies", "red", 10 * SECONDS, "Top películas", topMovie.key);
  }
  if (recap.binge || recap.calendar?.busiestDay?.minutes) add("binge", "orange", 9 * SECONDS, "Tu maratón");
  if (recap.rhythm?.reliable || recap.rhythm?.weekdaysReliable) add("rhythm", "navy", 10 * SECONDS, "Cuándo ves");
  if (recap.monthly?.peak) add("calendar", "emerald", 11 * SECONDS, "Tu año, día a día");
  if (recap.ratings?.count >= 3) add("ratings", "cyan", 10 * SECONDS, "Tus notas");
  if (recap.eras?.decades?.length) add("eras", "cream", 10 * SECONDS, "Viaje en el tiempo");
  if (recap.world?.languages?.length > 1 || recap.world?.distinctCountries > 2) add("world", "violet", 10 * SECONDS, "La vuelta al mundo");
  if (hasItems(recap.people?.actors) || hasItems(recap.people?.directors)) add("people", "night", 10 * SECONDS, "Las caras de tu año");
  if (milestoneTiles(recap).length >= 3) add("milestones", "lime", 10 * SECONDS, "Hitos");
  if (recap.persona) add("persona", "pink", 12 * SECONDS, "Tu perfil de espectador");
  add("summary", "night", null, "Tu resumen");
  return slides;
}

/** Baldosas de hitos del año que tienen valor (> 0). */
export function milestoneTiles(recap) {
  const m = recap?.milestones || {};
  const tiles = [
    { id: "completed", value: m.completedShows?.length || 0, label: "series terminadas" },
    { id: "newShows", value: m.newShows || 0, label: "series nuevas empezadas" },
    { id: "newMovies", value: m.newMovies || 0, label: "películas descubiertas" },
    { id: "rewatch", value: (m.rewatchMovies || 0) + (m.rewatchEpisodes || 0), label: "visionados repetidos" },
    { id: "favorites", value: m.favoritesAdded || 0, label: "nuevos favoritos" },
    { id: "watchlist", value: m.watchlistAdded || 0, label: "a tu lista de pendientes" },
    { id: "lists", value: m.listsCreated || 0, label: "listas creadas" },
    { id: "comments", value: m.comments || 0, label: "reseñas y comentarios" },
    { id: "followers", value: m.followersGained || 0, label: "nuevos seguidores" },
    { id: "likes", value: m.likesReceived || 0, label: "me gusta recibidos" },
    { id: "achievements", value: m.achievements?.length || 0, label: "logros desbloqueados" },
  ];
  return tiles.filter((tile) => tile.value > 0);
}

/** Títulos cuya banda sonora puede sonar, en orden de aparición. */
export function soundtrackSubjects(recap, slides) {
  const cards = new Map();
  const register = (card) => {
    if (card?.key && !cards.has(card.key)) cards.set(card.key, card);
  };
  Object.values(recap?.soundtrack?.cards || {}).forEach(register);
  register(recap?.topTitle);
  register(recap?.shows?.top?.[0]);
  register(recap?.movies?.top?.[0]);
  const keys = [...new Set((slides || []).map((slide) => slide.sound).filter(Boolean))];
  return keys.map((key) => cards.get(key)).filter(Boolean);
}

/** Frase de comparación con el año anterior, o null. */
export function previousYearLine(recap) {
  const delta = recap?.previous?.minutesDelta;
  if (delta == null || !Number.isFinite(delta)) return null;
  const previousYear = recap.year - 1;
  if (Math.abs(delta) < 5) return `Casi lo mismo que en ${previousYear}. Constancia pura.`;
  if (delta > 0) return `Un ${formatNumber(delta)} % más que en ${previousYear}.`;
  return `Un ${formatNumber(Math.abs(delta))} % menos que en ${previousYear}. Calidad antes que cantidad.`;
}

/** Frase sobre cómo puntúa el usuario frente a la media de TMDb. */
export function criticLine(vsTmdb) {
  if (vsTmdb == null || !Number.isFinite(vsTmdb)) return null;
  const abs = Math.abs(vsTmdb);
  if (abs < 0.3) return "Puntúas casi igual que la media de TMDb. Tienes el pulso del público.";
  if (vsTmdb > 0) return `Eres ${formatDecimal(abs, 1)} puntos más generoso que la media de TMDb.`;
  return `Eres ${formatDecimal(abs, 1)} puntos más exigente que la media de TMDb.`;
}
