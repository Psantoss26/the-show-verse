// Lista completa de cada sección del dashboard (Tendencias, Populares,
// Recomendados, Más esperadas). Solo servidor: la usan la página de la sección
// (que la entrega ya en el RSC, sin estado de carga) y su ruta de la API
// (/api/dashboard/sections/:section, el respaldo del cliente).
import {
  getTraktMoviesPopular,
  getTraktMoviesTrending,
  getTraktPopular,
  getTraktShowsPopular,
  getTraktShowsTrending,
  getTraktTrending,
} from "@/lib/api/traktHelpers";
import {
  getBackendBaseUrl,
  backendFetchJson,
  backendFetchPublicJson,
} from "@/lib/backend/server";

const TMDB_KEY =
  process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";

export const SECTION_CONFIG = {
  tendencias: {
    title: "Tendencias",
    description: "Los títulos que más se están moviendo ahora mismo.",
  },
  populares: {
    title: "Populares",
    description: "Películas y series con mayor tracción entre la comunidad.",
  },
  recomendados: {
    title: "Recomendados",
    description: "Recomendaciones destacadas por Trakt para descubrir qué ver después.",
  },
  "mas-esperadas": {
    title: "Más esperadas",
    description:
      "Películas y series aún no estrenadas, ordenadas por el interés que despiertan.",
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

  return mapEngineCards(row?.items, "mas-esperadas");
}

// Mapea las tarjetas del motor local (backend) a la forma que espera la sección.
function mapEngineCards(items, section) {
  return (Array.isArray(items) ? items : [])
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
          section,
          mediaType: card.mediaType === "tv" ? "tv" : "movie",
        },
      ),
    )
    .filter(Boolean);
}

// RECOMENDADOS: motor LOCAL (ya no Trakt).
// Autenticado → fila personalizada `for_you` del motor (que ahora prioriza la
// watchlist del usuario). Anónimo → generic pools (`popular`/`top_rated`), porque
// sin sesión no hay personalización. Antes esta sección usaba getTraktRecommended.
async function loadBackendRecommended(request, onBackendResult) {
  // 1) Personalizado (reenvía la sesión del usuario al motor).
  const personal = request
    ? await backendFetchJson(request, "/v1/dashboard/home", {
        method: "GET",
      }).catch(() => null)
    : null;
  if (personal) onBackendResult?.(personal);
  const personalRows = Array.isArray(personal?.json?.rows)
    ? personal.json.rows
    : [];
  const forYou = personalRows.find((r) => r?.key === "for_you");
  if (forYou?.items?.length) {
    return mapEngineCards(forYou.items, "recomendados");
  }

  // 2) Fallback anónimo: pools genéricos del motor.
  const baseUrl = getBackendBaseUrl();
  if (!baseUrl) return [];
  const response = await fetch(`${baseUrl}/v1/dashboard/home`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  }).catch(() => null);
  if (!response?.ok) return [];
  const json = await response.json().catch(() => null);
  const rows = Array.isArray(json?.rows) ? json.rows : [];
  const pool =
    rows.find((r) => r?.key === "popular") ||
    rows.find((r) => r?.key === "top_rated") ||
    rows.find((r) => r?.key === "trending");
  return mapEngineCards(pool?.items, "recomendados");
}

// Lista COMPLETA de una sección desde el motor (`/v1/dashboard/sections/:key`):
// los mismos pools y criterio que su fila del dashboard, pero hasta 200 títulos
// en vez de los 32 de la fila y sin la rotación diaria. Es pública: con sesión
// se adjunta (Recomendados es personal y excluye lo que el usuario ya tiene en
// su biblioteca) y sin ella el motor devuelve la versión genérica. Devuelve null si el motor no la sirve (p. ej. backend sin
// desplegar aún): entonces se usa la fila del dashboard como antes.
async function loadBackendSectionList(request, key, section, onBackendResult) {
  const result = request
    ? await backendFetchPublicJson(request, `/v1/dashboard/sections/${key}`, {
        method: "GET",
      }).catch(() => null)
    : null;
  if (result) onBackendResult?.(result);
  const items = Array.isArray(result?.json?.items) ? result.json.items : null;
  if (!result?.ok || !items?.length) return null;
  return mapEngineCards(items, section);
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

  // `recomendados` ya NO se sirve desde aquí: lo maneja loadBackendRecommended
  // (motor local). Se dejó de usar getTraktRecommended.

  return [];
}

export async function loadSectionItems(section, options = {}) {
  if (section === "mas-esperadas") {
    return (
      (await loadBackendSectionList(
        options.request,
        "anticipated",
        section,
        options.onBackendResult,
      )) || loadBackendAnticipated()
    );
  }

  if (section === "recomendados") {
    return (
      (await loadBackendSectionList(
        options.request,
        "for_you",
        section,
        options.onBackendResult,
      )) ||
      loadBackendRecommended(options.request, options.onBackendResult)
    );
  }

  if (section === "tendencias") {
    // La MISMA lista que la fila "Tendencias ahora mismo" de Inicio (motor):
    // la fila enseña sus primeros títulos en el mismo orden. Si el motor no la
    // sirve, la mezcla de Trakt + TMDb de antes.
    const engine = await loadBackendSectionList(
      options.request,
      "trending",
      section,
      options.onBackendResult,
    );
    if (engine) return engine;
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

