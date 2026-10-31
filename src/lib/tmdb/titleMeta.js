// Géneros y duración de un título para las filas de la vista de lista
// (TitleRow). Lo comparten la ruta /api/tmdb/title-meta, que elige a partir de
// la ficha de TMDb, y el cliente por lotes (titleMetaBatch), que lo formatea.

import { translateGenre } from "../details/formatters.js";

const MAX_GENRES = 2;

/** "movie:603" / "tv:1396" o null si no es una clave válida. */
export function normalizeTitleMetaKey(value) {
  const match = /^(movie|tv):(\d+)$/.exec(String(value || "").trim());
  return match ? `${match[1]}:${match[2]}` : null;
}

export function titleMetaKey(mediaType, id) {
  if (id == null) return null;
  return normalizeTitleMetaKey(`${mediaType === "tv" ? "tv" : "movie"}:${id}`);
}

function positiveMinutes(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/**
 * { genres: [≤2 nombres en español], runtime: minutos | null, year: "1999" | "" }
 * de la ficha. En series, la duración es la de un episodio. El año sirve a las
 * listas cuyos elementos guardados no traen fecha (Mis listas, Comunidad).
 */
export function pickTitleMeta(details, mediaType) {
  const genres = (Array.isArray(details?.genres) ? details.genres : [])
    .map((genre) => translateGenre(genre?.name))
    .filter((name) => typeof name === "string" && name.trim())
    .slice(0, MAX_GENRES);
  const runtime =
    mediaType === "tv"
      ? positiveMinutes(details?.episode_run_time?.[0]) ??
        positiveMinutes(details?.last_episode_to_air?.runtime) ??
        positiveMinutes(details?.next_episode_to_air?.runtime)
      : positiveMinutes(details?.runtime);
  const date = String(details?.release_date || details?.first_air_date || "");
  const year = /^\d{4}/.test(date) ? date.slice(0, 4) : "";
  return { genres, runtime, year };
}

/** 148 → «2 h 28 min»; 45 → «45 min»; 120 → «2 h». */
export function formatRuntime(minutes) {
  const total = positiveMinutes(minutes);
  if (!total) return "";
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
