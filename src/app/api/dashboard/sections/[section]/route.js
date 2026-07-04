import { NextResponse } from "next/server";
import {
  getTraktMoviesPopular,
  getTraktMoviesTrending,
  getTraktPopular,
  getTraktRecommended,
  getTraktShowsPopular,
  getTraktShowsTrending,
  getTraktTrending,
} from "@/lib/api/traktHelpers";
import { getBackendBaseUrl } from "@/lib/backend/server";
import { getValidTraktToken } from "@/lib/trakt/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TMDB_KEY =
  process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";

const SECTION_CONFIG = {
  tendencias: {
    title: "Tendencias",
    eyebrow: "TRAKT / TMDB",
    description: "Los títulos que más se están moviendo ahora mismo.",
  },
  populares: {
    title: "Populares",
    eyebrow: "TRAKT / TMDB",
    description: "Películas y series con mayor tracción entre la comunidad.",
  },
  recomendados: {
    title: "Recomendados",
    eyebrow: "TRAKT",
    description: "Recomendaciones destacadas por Trakt para descubrir qué ver después.",
  },
  "mas-esperadas": {
    title: "Más esperadas",
    eyebrow: "PRÓXIMAMENTE",
    description:
      "Películas aún no estrenadas que más interés están generando.",
  },
};

function withMeta(item, { source, section, mediaType } = {}) {
  if (!item?.id) return null;
  const type =
    mediaType ||
    item.media_type ||
    (item.name && !item.title ? "tv" : item.first_air_date ? "tv" : "movie");

  return {
    ...item,
    media_type: type,
    source,
    sources: source ? [source] : [],
    section,
    _key: `${source}:${type}:${item.id}`,
  };
}

function dedupe(items = []) {
  const seen = new Map();
  const out = [];

  for (const item of items) {
    if (!item?.id) continue;
    const key = `${item.media_type}:${item.id}`;
    if (seen.has(key)) {
      const existing = seen.get(key);
      const sources = new Set([
        ...(Array.isArray(existing.sources) ? existing.sources : []),
        ...(Array.isArray(item.sources) ? item.sources : []),
        existing.source,
        item.source,
      ].filter(Boolean));
      existing.sources = Array.from(sources);
      continue;
    }
    seen.set(key, item);
    out.push(item);
  }

  return out;
}

async function tmdb(path, params = {}) {
  if (!TMDB_KEY) return [];

  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", TMDB_KEY);
  url.searchParams.set("language", "es-ES");
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });

  const res = await fetch(url, {
    cache: "force-cache",
    next: { revalidate: 60 * 30 },
  });
  if (!res.ok) return [];
  const json = await res.json().catch(() => null);
  return Array.isArray(json?.results) ? json.results : [];
}

async function tmdbPaged(path, params = {}, pages = 5) {
  const results = await Promise.all(
    Array.from({ length: pages }, (_, index) =>
      tmdb(path, { ...params, page: index + 1 }),
    ),
  );
  return results.flat();
}

async function loadTmdbTrending() {
  const rows = await tmdbPaged("/trending/all/week", {}, 5);
  return rows
    .filter((item) => item?.media_type === "movie" || item?.media_type === "tv")
    .map((item) =>
      withMeta(item, {
        source: "tmdb",
        section: "tendencias",
      }),
    )
    .filter(Boolean);
}

async function loadTmdbPopular() {
  const [movies, shows] = await Promise.all([
    tmdbPaged("/movie/popular", {}, 5),
    tmdbPaged("/tv/popular", {}, 5),
  ]);

  return [
    ...movies.map((item) =>
      withMeta(item, {
        source: "tmdb",
        section: "populares",
        mediaType: "movie",
      }),
    ),
    ...shows.map((item) =>
      withMeta(item, {
        source: "tmdb",
        section: "populares",
        mediaType: "tv",
      }),
    ),
  ].filter(Boolean);
}

async function loadBackendAnticipated() {
  const baseUrl = getBackendBaseUrl();
  if (!baseUrl) return [];

  const response = await fetch(`${baseUrl}/v1/dashboard/home`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  }).catch(() => null);
  if (!response?.ok) return [];

  const json = await response.json().catch(() => null);
  const row = Array.isArray(json?.rows)
    ? json.rows.find((candidate) => candidate?.key === "anticipated")
    : null;

  return (Array.isArray(row?.items) ? row.items : [])
    .map((card) =>
      withMeta(
        {
          id: card.tmdbId,
          title: card.title,
          original_title: card.title,
          poster_path: card.posterPath || null,
          backdrop_path: card.backdropPath || null,
          vote_average: card.voteAverage || 0,
          vote_count: card.voteCount || 0,
          popularity: card.popularity || 0,
          genre_ids: Array.isArray(card.genreIds) ? card.genreIds : [],
          release_date:
            card.releaseDate || (card.year ? `${card.year}-01-01` : null),
        },
        {
          source: "tmdb",
          section: "mas-esperadas",
          mediaType: "movie",
        },
      ),
    )
    .filter(Boolean);
}

async function loadTraktSection(section, { traktToken = null } = {}) {
  if (section === "tendencias") {
    const [mixed, movies, shows] = await Promise.all([
      getTraktTrending(100).catch(() => []),
      getTraktMoviesTrending(80).catch(() => []),
      getTraktShowsTrending(80).catch(() => []),
    ]);
    return dedupe([...mixed, ...movies, ...shows])
      .map((item) => withMeta(item, { source: "trakt", section }))
      .filter(Boolean);
  }

  if (section === "populares") {
    const [mixed, movies, shows] = await Promise.all([
      getTraktPopular(100).catch(() => []),
      getTraktMoviesPopular(80).catch(() => []),
      getTraktShowsPopular(80).catch(() => []),
    ]);
    return dedupe([...mixed, ...movies, ...shows])
      .map((item) => withMeta(item, { source: "trakt", section }))
      .filter(Boolean);
  }

  if (section === "recomendados") {
    return dedupe(
      await getTraktRecommended(120, "weekly", {
        token: traktToken,
      }).catch(() => []),
    )
      .map((item) => withMeta(item, { source: "trakt", section }))
      .filter(Boolean);
  }

  return [];
}

async function loadSectionItems(section, options = {}) {
  if (section === "mas-esperadas") {
    return loadBackendAnticipated();
  }

  if (section === "tendencias") {
    const [trakt, tmdbItems] = await Promise.all([
      loadTraktSection(section, options),
      loadTmdbTrending(),
    ]);
    return dedupe([...trakt, ...tmdbItems]);
  }

  if (section === "populares") {
    const [trakt, tmdbItems] = await Promise.all([
      loadTraktSection(section, options),
      loadTmdbPopular(),
    ]);
    return dedupe([...trakt, ...tmdbItems]);
  }

  return loadTraktSection(section, options);
}

export async function GET(request, { params }) {
  const { section } = await params;
  const config = SECTION_CONFIG[section];

  if (!config) {
    return NextResponse.json(
      { error: "Sección no encontrada", items: [] },
      { status: 404 },
    );
  }

  try {
    const { token: traktToken } = await getValidTraktToken(
      request.cookies,
    ).catch(() => ({ token: null }));
    const items = await loadSectionItems(section, { traktToken });
    return NextResponse.json({
      section,
      ...config,
      items,
    });
  } catch (err) {
    console.error(`Error cargando sección ${section}:`, err);
    return NextResponse.json(
      {
        section,
        ...config,
        items: [],
        error: "No se pudo cargar la sección.",
      },
      { status: 200 },
    );
  }
}
