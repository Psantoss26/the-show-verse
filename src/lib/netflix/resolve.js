// src/lib/netflix/resolve.js
// Resolución de títulos de Netflix (CSV o actividad de visionado) a entidades de TMDb.
// Compartido por la importación CSV (/api/netflix/import) y la sincronización
// automática de la extensión (/api/netflix/extension-import).

const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_KEY = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
export const NETFLIX_MAX_ROWS = 1000;

export function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function parseNetflixDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const iso = new Date(raw);
  if (!Number.isNaN(iso.getTime())) return iso.toISOString();

  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return null;

  const [, monthRaw, dayRaw, yearRaw] = match;
  const year = Number(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw);
  const month = Number(monthRaw) - 1;
  const day = Number(dayRaw);
  const date = new Date(Date.UTC(year, month, day, 12, 0, 0));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function parseNetflixTitle(value) {
  const title = String(value || "").trim();
  if (!title) return null;

  const parts = title.split(":").map((part) => part.trim()).filter(Boolean);
  const seasonIndex = parts.findIndex((part) =>
    /^(season|temporada)\s+\d+$/i.test(part),
  );

  if (seasonIndex > 0) {
    const season = Number(parts[seasonIndex].match(/\d+/)?.[0] || 0);
    const showTitle = parts.slice(0, seasonIndex).join(": ");
    const episodeTitle = parts.slice(seasonIndex + 1).join(": ");
    if (showTitle && season && episodeTitle) {
      return {
        kind: "episode",
        originalTitle: title,
        showTitle,
        season,
        episodeTitle,
      };
    }
  }

  return { kind: "movie", originalTitle: title, movieTitle: title };
}

async function tmdbFetch(path, params = {}) {
  if (!TMDB_KEY) throw new Error("TMDB_API_KEY is not configured");
  const url = new URL(`${TMDB_API}${path}`);
  url.searchParams.set("api_key", TMDB_KEY);
  url.searchParams.set("language", "es-ES");
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

function pickBestResult(results, query, titleKey) {
  const safeResults = Array.isArray(results) ? results : [];
  if (!safeResults.length) return null;
  const normalizedQuery = normalizeText(query);
  return (
    safeResults.find((item) => normalizeText(item?.[titleKey]) === normalizedQuery) ||
    safeResults.find((item) => normalizeText(item?.original_title || item?.original_name) === normalizedQuery) ||
    safeResults[0]
  );
}

async function resolveMovie(item) {
  const data = await tmdbFetch("/search/movie", {
    query: item.movieTitle,
    include_adult: "false",
    page: 1,
  });
  const movie = pickBestResult(data?.results, item.movieTitle, "title");
  if (!movie?.id) return null;
  return {
    tmdbId: Number(movie.id),
    mediaType: "movie",
    watchedAt: item.watchedAt,
    title: movie.title || item.movieTitle,
    posterPath: movie.poster_path || null,
  };
}

async function fetchSeason(showId, season, language) {
  const url = new URL(`${TMDB_API}/tv/${encodeURIComponent(showId)}/season/${encodeURIComponent(season)}`);
  url.searchParams.set("api_key", TMDB_KEY);
  url.searchParams.set("language", language);
  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

async function resolveEpisode(item) {
  const showData = await tmdbFetch("/search/tv", {
    query: item.showTitle,
    include_adult: "false",
    page: 1,
  });
  const show = pickBestResult(showData?.results, item.showTitle, "name");
  if (!show?.id) return null;

  const [seasonEs, seasonEn] = await Promise.all([
    fetchSeason(show.id, item.season, "es-ES"),
    fetchSeason(show.id, item.season, "en-US"),
  ]);
  const episodes = [
    ...(Array.isArray(seasonEs?.episodes) ? seasonEs.episodes : []),
    ...(Array.isArray(seasonEn?.episodes) ? seasonEn.episodes : []),
  ];
  const normalizedEpisodeTitle = normalizeText(item.episodeTitle);
  const episode = episodes.find(
    (candidate) => normalizeText(candidate?.name) === normalizedEpisodeTitle,
  );

  if (!episode?.episode_number) return null;

  return {
    tmdbId: Number(show.id),
    mediaType: "tv",
    season: Number(item.season),
    episode: Number(episode.episode_number),
    watchedAt: item.watchedAt,
    title: `${show.name || item.showTitle}: ${episode.name || item.episodeTitle}`,
    posterPath: show.poster_path || null,
  };
}

/**
 * Resuelve filas de actividad de Netflix (`{ title, date }`) a entradas de
 * historial con IDs de TMDb. Acepta las cabeceras del CSV en español/inglés.
 */
export async function resolveNetflixItems(rows, { maxRows = NETFLIX_MAX_ROWS } = {}) {
  const resolved = [];
  const skipped = [];
  const seen = new Set();

  for (const row of (Array.isArray(rows) ? rows : []).slice(0, maxRows)) {
    const title = row.title || row.titulo || row.título;
    const watchedAt = parseNetflixDate(row.date || row.fecha);
    const parsed = parseNetflixTitle(title);
    if (!parsed || !watchedAt) {
      skipped.push({ title, reason: "Formato no reconocido" });
      continue;
    }

    const cacheKey = `${parsed.kind}:${parsed.originalTitle}:${watchedAt}`;
    if (seen.has(cacheKey)) continue;
    seen.add(cacheKey);

    const item = { ...parsed, watchedAt };
    const match =
      parsed.kind === "episode"
        ? await resolveEpisode(item)
        : await resolveMovie(item);

    if (match) resolved.push(match);
    else skipped.push({ title: parsed.originalTitle, reason: "No se pudo resolver en TMDb" });
  }

  return { resolved, skipped, limited: (Array.isArray(rows) ? rows.length : 0) > maxRows };
}
