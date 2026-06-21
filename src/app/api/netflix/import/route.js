import { NextResponse } from "next/server";
import {
  backendFetchJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_KEY = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
const MAX_ROWS = 1000;

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  if (rows.length < 2) return [];

  const headers = rows[0].map((value) => normalizeText(value));
  return rows.slice(1).map((values) => {
    const item = {};
    headers.forEach((header, index) => {
      item[header] = values[index]?.trim() || "";
    });
    return item;
  });
}

function parseNetflixDate(value) {
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

function parseNetflixTitle(value) {
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

async function resolveNetflixItems(rows) {
  const resolved = [];
  const skipped = [];
  const seen = new Set();

  for (const row of rows.slice(0, MAX_ROWS)) {
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

  return { resolved, skipped, limited: rows.length > MAX_ROWS };
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file.text !== "function") {
      return NextResponse.json({ error: "Selecciona el CSV de actividad de Netflix." }, { status: 400 });
    }

    const text = await file.text();
    const rows = parseCsv(text);
    if (!rows.length) {
      return NextResponse.json({ error: "El CSV no contiene actividad válida." }, { status: 400 });
    }

    const { resolved, skipped, limited } = await resolveNetflixItems(rows);
    if (!resolved.length) {
      return NextResponse.json(
        {
          error: "No se pudo resolver ningún título del CSV con TMDb.",
          fetched: rows.length,
          skipped,
          limited,
        },
        { status: 422 },
      );
    }

    const backend = await backendFetchJson(request, "/v1/import/netflix/data/chunk", {
      method: "POST",
      body: JSON.stringify({ history: resolved }),
    });

    if (!backend.ok) {
      return NextResponse.json(
        { error: backend.error || "No se pudo importar la actividad de Netflix." },
        { status: backend.status || 500 },
      );
    }

    const response = NextResponse.json({
      ok: true,
      provider: "netflix",
      fetched: rows.length,
      resolved: resolved.length,
      skipped: skipped.length,
      limited,
      import: backend.json,
      skippedSamples: skipped.slice(0, 10),
    });

    setBackendAuthCookies(response, backend, {
      secure: getCookieSecure(request),
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "No se pudo importar Netflix." },
      { status: 500 },
    );
  }
}
