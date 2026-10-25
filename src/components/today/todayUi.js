// src/components/today/todayUi.js
// Piezas compartidas por los componentes de la página Hoy: tokens de cristal,
// rutas de imagen y redacción de cada acción. La página es de la familia de
// Social, así que lleva su mismo rosa/fucsia.

import { MILESTONE_LABELS } from "@/lib/today/stories";

export const CONTROL_GLASS =
  "bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg";
export const CARD_GLASS =
  "bg-gradient-to-br from-white/[0.07] to-white/[0.03] backdrop-blur-md shadow-lg";
// Superficie lisa de las tarjetas de Hoy: sin desenfoque (un backdrop-filter
// en cada tarjeta de una rejilla larga emborrona el texto al desplazar).
export const CARD_SURFACE = "bg-white/[0.04] ring-1 ring-inset ring-white/[0.06]";
export const ACTIVE_PILL =
  "bg-gradient-to-br from-pink-500 to-fuchsia-600 text-white shadow-lg shadow-pink-500/20";

export function tmdbImage(path, size = "w342") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

export function displayName(user) {
  return user?.displayName || user?.username || "Alguien";
}

export function profileHref(user) {
  return user?.username ? `/u/${encodeURIComponent(user.username)}` : null;
}

export function titleHref(media) {
  if (!media?.tmdbId) return null;
  return `/details/${media.type === "tv" ? "tv" : "movie"}/${media.tmdbId}`;
}

export function episodeLabel(action) {
  if (action?.season == null || action?.episode == null) return "";
  return `T${action.season} · E${action.episode}`;
}

/** Nota tal cual se puntúa, de 0 a 10 con coma: 9.5 → «9,5», 8 → «8». */
export function ratingTen(rating) {
  if (typeof rating !== "number" || !Number.isFinite(rating)) return "";
  return (Math.round(rating * 10) / 10).toLocaleString("es-ES", { maximumFractionDigits: 1 });
}

const keyFormatters = new Map();
function localKey(ms, tz) {
  const k = tz || "local";
  if (!keyFormatters.has(k)) {
    keyFormatters.set(k, new Intl.DateTimeFormat("en-CA", { timeZone: tz || undefined, year: "numeric", month: "2-digit", day: "2-digit" }));
  }
  return keyFormatters.get(k).format(new Date(ms));
}

/**
 * Cuándo, como en Trakt: la hora si es de hoy, «ayer, 22:03» y, más atrás, el
 * día de la semana con la hora («jue, 20:14»).
 */
export function whenLabel(value, tz, now = Date.now()) {
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return "";
  const time = clockTime(ms, tz);
  const day = localKey(ms, tz);
  if (day === localKey(now, tz)) return time;
  if (day === localKey(now - 24 * 60 * 60 * 1000, tz)) return `ayer, ${time}`;
  const weekday = new Intl.DateTimeFormat("es-ES", { weekday: "short", timeZone: tz || undefined })
    .format(new Date(ms))
    .replace(".", "");
  return `${weekday}, ${time}`;
}

export function milestoneLabel(milestone) {
  return MILESTONE_LABELS[milestone] || "";
}

/**
 * Frase corta de la acción, sin el título: «ha visto 4 episodios»,
 * «ha puntuado T1 · E2», «ha escrito una reseña».
 */
export function actionPhrase(action) {
  if (!action) return "";
  if (action.kind === "watch") {
    if (action.target === "episode") {
      return action.episodeCount > 1
        ? `ha visto ${action.episodeCount} episodios`
        : `ha visto ${episodeLabel(action)}`;
    }
    return "ha visto";
  }
  if (action.kind === "rating") {
    if (action.target === "episode") return `ha puntuado ${episodeLabel(action)}`;
    if (action.target === "season") return `ha puntuado la temporada ${action.season}`;
    return "ha puntuado";
  }
  if (action.kind === "comment") return "ha escrito una reseña";
  return "";
}

/** Etiqueta de una pestaña de día: Hoy, Ayer, o el día de la semana. */
export function dayTabLabel(key, index) {
  if (key === "today") return "Hoy";
  if (key === "week") return "Semana";
  if (index === 1) return "Ayer";
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  const label = new Intl.DateTimeFormat("es-ES", { weekday: "short", timeZone: "UTC" }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1).replace(".", "");
}

export function clockTime(value, tz) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: tz || undefined }).format(date);
}

export function dayHeading(dayKey) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const label = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m - 1, d, 12)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}
