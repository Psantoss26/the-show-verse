// /lib/api/tmdb.js
const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;
const BASE_URL = "https://api.themoviedb.org/3";
const IS_SERVER = typeof window === "undefined";

/* -------------------- Helper unificado -------------------- */
function buildUrl(path, params = {}) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  const url = new URL(`${BASE_URL}${normalizedPath}`);
  url.searchParams.set("api_key", API_KEY || "");

  if (!("language" in params)) {
    url.searchParams.set("language", "es-ES");
  }

  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });

  return url.toString();
}

/**
 * Cliente TMDb con:
 * - Timeout
 * - Caching en servidor (ISR) para endpoints de catálogo
 * - Menos ruido en consola con aborts
 */
async function tmdb(path, params = {}, options = {}) {
  if (!API_KEY) {
    console.error("TMDb API key missing (NEXT_PUBLIC_TMDB_API_KEY)");
    return null;
  }

  // En servidor: timeout más corto, caching por defecto
  // En cliente: dejamos más margen al usuario
  const { timeoutMs = 8000, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // En servidor: cacheamos y revalidamos cada 10 min por defecto.
    // En cliente: no-store (el browser ya gestiona su propio cache HTTP).
    const baseInit = IS_SERVER
      ? {
        cache: "force-cache",
        next: { revalidate: 60 * 10 }, // 10 minutos
      }
      : {
        cache: "no-store",
      };

    const res = await fetch(buildUrl(path, params), {
      ...baseInit,
      ...fetchOptions, // permite override: cache, next, headers...
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      // 404 / status_code 34 => recurso inexistente
      if (res.status === 404 || json?.status_code === 34) {
        // Si quieres ver algo en dev, descomenta:
        // if (process.env.NODE_ENV === 'development') {
        //   console.warn('TMDb recurso no encontrado:', path)
        // }
        return null;
      }

      console.error("TMDb error:", res.status, json);
      return null;
    }

    return json;
  } catch (e) {
    clearTimeout(timeoutId);
    const code = e?.code || e?.cause?.code;

    // Abort típico por cambio de ruta / navegación / timeout
    if (e?.name === "AbortError" || code === "UND_ERR_ABORTED") {
      // Estos aborts son normales al navegar, NO queremos ruido:
      // Si quieres debug, puedes activar el log:
      // if (process.env.NODE_ENV === 'development') {
      //   console.warn('[TMDb] Petición abortada (timeout/navegación):', path)
      // }
      return null;
    }

    // Timeout de conexión real hasta TMDb
    if (code === "UND_ERR_CONNECT_TIMEOUT") {
      console.warn("[TMDb] Timeout de conexión con TMDb en", path);
      return null;
    }

    console.error("TMDb fetch error:", path, e);
    return null;
  }
}

/* -------------------- Películas (Movies) -------------------- */
export async function fetchTopRatedMovies() {
  const data = await tmdb("/movie/top_rated", { page: 1 });
  return data?.results || [];
}

export async function fetchTrendingMovies() {
  const data = await tmdb("/trending/movie/week");
  return data?.results || [];
}

export async function fetchPopularMovies() {
  const data = await tmdb("/movie/popular", { page: 1 });
  return data?.results || [];
}

/**
 * Recomendadas para el usuario (si tu flujo usa esto).
 * Ojo: este endpoint puede no estar habilitado para todos los setups.
 * Fallback: [] si no existe o falla.
 */
export async function fetchRecommendedMovies(sessionId) {
  if (!sessionId) return [];
  const data = await tmdb("/account/0/recommendations", {
    session_id: sessionId,
  });
  return data?.results || [];
}

export async function fetchDramaMovies() {
  const data = await tmdb("/discover/movie", {
    with_genres: 18,
    sort_by: "vote_average.desc",
    "vote_count.gte": 100,
    page: 1,
  });
  return data?.results || [];
}

export async function fetchCultClassics() {
  // lista pública de ejemplo (id 8146) — puede variar
  const data = await tmdb("/list/8146", { language: "es-ES" });
  return data?.items || [];
}

export async function fetchPopularInCountry(countryCode = "US") {
  const data = await tmdb("/discover/movie", {
    region: countryCode,
    sort_by: "popularity.desc",
    page: 1,
  });
  return data?.results || [];
}

export async function fetchTopActionMovies() {
  const data = await tmdb("/discover/movie", {
    with_genres: 28,
    sort_by: "vote_average.desc",
    "vote_count.gte": 200,
    page: 1,
  });
  return data?.results || [];
}

export async function fetchMindBendingMovies() {
  // keyword 2343 ~ "twist"; puedes ajustar a otra(s) keyword(s)
  const data = await tmdb("/discover/movie", {
    with_keywords: 2343,
    sort_by: "vote_average.desc",
    "vote_count.gte": 100,
    page: 1,
  });
  return data?.results || [];
}

export async function fetchPopularInUS() {
  const data = await tmdb("/discover/movie", {
    region: "US",
    sort_by: "popularity.desc",
    page: 1,
  });
  return data?.results || [];
}

export async function fetchUnderratedMovies() {
  const data = await tmdb("/discover/movie", {
    sort_by: "vote_average.desc",
    "vote_count.lte": 200,
    "vote_average.gte": 7.0,
    page: 1,
  });
  return data?.results || [];
}

export async function fetchRisingMovies() {
  const currentYear = new Date().getFullYear();
  const data = await tmdb("/discover/movie", {
    primary_release_year: currentYear,
    sort_by: "vote_average.asc",
    "vote_count.gte": 50,
    page: 1,
  });
  return data?.results || [];
}

export async function fetchFeaturedMovies() {
  const data = await tmdb("/movie/popular", { page: 1 });
  return data?.results || [];
}

export async function fetchGenres() {
  const data = await tmdb("/genre/movie/list");
  return data?.genres || [];
}

export async function fetchMoviesByGenre(genreId) {
  const data = await tmdb("/discover/movie", { with_genres: genreId, page: 1 });
  return data?.results || [];
}

/* -------------------- Series (TV) -------------------- */
export async function fetchPopularTV() {
  const data = await tmdb("/tv/popular", { page: 1 });
  return data?.results || [];
}

export async function fetchTopRatedTV() {
  const data = await tmdb("/tv/top_rated", { page: 1 });
  return data?.results || [];
}

export async function fetchTrendingTV() {
  const data = await tmdb("/trending/tv/week");
  return data?.results || [];
}

export async function fetchAiringTodayTV() {
  const data = await tmdb("/tv/airing_today", { page: 1 });
  return data?.results || [];
}

export async function fetchOnTheAirTV() {
  const data = await tmdb("/tv/on_the_air", { page: 1 });
  return data?.results || [];
}

export async function fetchDramaTV() {
  const data = await tmdb("/discover/tv", {
    with_genres: 18,
    sort_by: "popularity.desc",
    page: 1,
  });
  return data?.results || [];
}

export async function getWatchProviders(type, id, region = "ES") {
  if (!API_KEY) {
    return { providers: [], link: null };
  }

  const res = await fetch(
    `https://api.themoviedb.org/3/${type}/${id}/watch/providers?api_key=${API_KEY}`,
    { next: { revalidate: 60 * 60 } }, // opcional: cache 1h
  );

  if (!res.ok) {
    console.error("Error watch/providers", await res.text());
    return { providers: [], link: null };
  }

  const data = await res.json();

  // Elegimos el país: primero region (ES), luego US, luego el primero que haya
  const country =
    data.results?.[region] ??
    data.results?.US ??
    Object.values(data.results || {})[0];

  if (!country) return { providers: [], link: null };

  const baseLink = country.link || null;

  // Juntamos todas las listas (streaming, alquiler, compra…)
  const allLists = [
    ...(country.flatrate || []),
    ...(country.rent || []),
    ...(country.buy || []),
    ...(country.ads || []),
    ...(country.free || []),
  ];

  // Evitar duplicados por provider_id
  const byId = new Map();
  for (const p of allLists) {
    if (!byId.has(p.provider_id)) {
      byId.set(p.provider_id, {
        ...p,
        link: baseLink, // añadimos el enlace de TMDb a cada provider
      });
    }
  }

  const providers = Array.from(byId.values()).sort(
    (a, b) => (a.display_priority ?? 9999) - (b.display_priority ?? 9999),
  );

  return { providers, link: baseLink };
}

/* -------------------- Detalles / Imágenes / IDs externos -------------------- */
export async function getDetails(type, id) {
  const data = await tmdb(`/${type}/${id}`, {
    append_to_response: "external_ids",
  });
  if (type === "tv" && data) {
    data.imdb_id = data?.external_ids?.imdb_id || null;
  }
  return data;
}

export async function getLogos(type, id) {
  const data = await tmdb(`/${type}/${id}/images`, {
    // recibimos todos y filtramos
    include_image_language: "es,en,null",
  });
  const logos = data?.logos || [];
  if (!logos.length) return null;

  const filtered = logos.filter((l) =>
    ["es", "en", null].includes(l.iso_639_1),
  );
  const pool = filtered.length ? filtered : logos;
  const best = pool.reduce(
    (max, l) => ((l.vote_count || 0) > (max.vote_count || 0) ? l : max),
    pool[0],
  );
  return best?.file_path || null;
}

export async function getRecommendations(type, id) {
  if (!type || !id) return null;
  return await tmdb(`/${type}/${id}/recommendations`);
}

export async function getCredits(type, id) {
  if (!type || !id) return null;
  return await tmdb(`/${type}/${id}/credits`);
}

export async function getProviders(type, id) {
  if (!type || !id) return null;
  return await tmdb(`/${type}/${id}/watch/providers`);
}

export async function getReviews(type, id) {
  if (!type || !id) return null;
  return await tmdb(`/${type}/${id}/reviews`);
}

// Detalles de película (para runtime)
export async function getMovieDetails(id) {
  const data = await tmdb(`/movie/${id}`);
  return data || null; // { runtime, imdb_id, ... }
}

// IDs externos (para imdb_id). Nota: sin language.
export async function getExternalIds(type, id) {
  const data = await tmdb(`/${type}/${id}/external_ids`, {
    language: undefined,
  });
  return data || null; // { imdb_id, ... }
}

/* -------------------- Actor -------------------- */
export async function getActorDetails(id) {
  const data = await tmdb(`/person/${id}`, { language: "es-ES" });
  return data || null;
}

export async function getActorMovies(id) {
  const data = await tmdb(`/person/${id}/movie_credits`, { language: "es-ES" });
  return data || { cast: [] };
}

/* -------------------- Ratings por episodio (API local) -------------------- */
export async function getTvEpisodeRatings(
  tmdbId,
  { excludeSpecials = true } = {},
) {
  const res = await fetch(
    `/api/tv/${tmdbId}/ratings?excludeSpecials=${excludeSpecials ? "true" : "false"}`,
    { cache: "no-store" },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || "No se pudo obtener ratings");
  return json;
}

/* -------------------- Cuenta: favoritos / watchlist -------------------- */
export async function getMediaAccountStates(type, id, sessionOrOpts) {
  const empty = { favorite: false, watchlist: false, rated: null };

  if (!API_KEY) return empty;
  if (!id) return empty;

  // account_states NO existe para "person"
  if (type !== "movie" && type !== "tv") return empty;

  // Compat: acepta string (sessionId) o { sessionId, guestSessionId }
  const params = {};
  if (typeof sessionOrOpts === "string" && sessionOrOpts) {
    params.session_id = sessionOrOpts;
  } else if (sessionOrOpts?.sessionId) {
    params.session_id = sessionOrOpts.sessionId;
  } else if (sessionOrOpts?.guestSessionId) {
    params.guest_session_id = sessionOrOpts.guestSessionId;
  } else {
    return empty;
  }

  const data = await tmdb(`/${type}/${id}/account_states`, params, {
    cache: "no-store",
  });
  if (!data) return empty;

  return {
    favorite: !!data.favorite,
    watchlist: !!data.watchlist,
    rated: data.rated ?? null,
  };
}

export async function markAsFavorite({
  accountId,
  sessionId,
  type,
  mediaId,
  favorite,
}) {
  if (!accountId || !sessionId)
    throw new Error("Faltan accountId o sessionId para marcar favorito");

  const res = await fetch(
    buildUrl(`/account/${accountId}/favorite`, { session_id: sessionId }),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: type,
        media_id: mediaId,
        favorite,
      }),
    },
  );
  const data = await res.json();
  if (!res.ok || data?.success === false) {
    console.error("TMDb markAsFavorite error:", data);
    throw new Error(data?.status_message || "No se pudo actualizar favorito");
  }
  return data;
}

export async function markInWatchlist({
  accountId,
  sessionId,
  type,
  mediaId,
  watchlist,
}) {
  if (!accountId || !sessionId)
    throw new Error("Faltan accountId o sessionId para watchlist");

  const res = await fetch(
    buildUrl(`/account/${accountId}/watchlist`, { session_id: sessionId }),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: type,
        media_id: mediaId,
        watchlist,
      }),
    },
  );
  const data = await res.json();
  if (!res.ok || data?.success === false) {
    console.error("TMDb markInWatchlist error:", data);
    throw new Error(
      data?.status_message || "No se pudo actualizar la lista de pendientes",
    );
  }
  return data;
}

export async function fetchFavoritesForUser(accountId, sessionId) {
  if (!accountId || !sessionId) return [];

  const fetchAllPages = async (path, mediaType) => {
    // First request to get total pages
    const firstRes = await fetch(
      buildUrl(path, {
        session_id: sessionId,
        sort_by: "created_at.desc",
        page: 1,
      }),
      { cache: "no-store" },
    );
    const firstData = await firstRes.json();
    if (!firstRes.ok)
      throw new Error(firstData?.status_message || "TMDb error");

    const totalPages = firstData.total_pages || 1;
    const allResults = [...(firstData.results || [])];

    // If there are more pages, fetch them in parallel (max 5 concurrent)
    if (totalPages > 1) {
      const pagePromises = [];
      for (let page = 2; page <= totalPages; page++) {
        pagePromises.push(
          fetch(
            buildUrl(path, {
              session_id: sessionId,
              sort_by: "created_at.desc",
              page,
            }),
            { cache: "no-store" },
          )
            .then((res) => res.json())
            .then((data) => data.results || [])
            .catch(() => []),
        );
      }

      // Process in batches of 5 to avoid overwhelming the API
      const batchSize = 5;
      for (let i = 0; i < pagePromises.length; i += batchSize) {
        const batch = pagePromises.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch);
        batchResults.forEach((results) => allResults.push(...results));
      }
    }

    return allResults.map((item) => ({
      ...item,
      media_type: mediaType,
    }));
  };

  try {
    const [movies, tv] = await Promise.all([
      fetchAllPages(`/account/${accountId}/favorite/movies`, "movie"),
      fetchAllPages(`/account/${accountId}/favorite/tv`, "tv"),
    ]);
    return [...movies, ...tv];
  } catch (e) {
    console.error("fetchFavoritesForUser error:", e);
    return [];
  }
}

export async function fetchWatchlistForUser(accountId, sessionId) {
  if (!accountId || !sessionId) return [];

  const fetchAllPages = async (path, mediaType) => {
    // First request to get total pages
    const firstRes = await fetch(
      buildUrl(path, {
        session_id: sessionId,
        sort_by: "created_at.desc",
        page: 1,
      }),
      { cache: "no-store" },
    );
    const firstData = await firstRes.json();
    if (!firstRes.ok)
      throw new Error(firstData?.status_message || "TMDb error");

    const totalPages = firstData.total_pages || 1;
    const allResults = [...(firstData.results || [])];

    // If there are more pages, fetch them in parallel (max 5 concurrent)
    if (totalPages > 1) {
      const pagePromises = [];
      for (let page = 2; page <= totalPages; page++) {
        pagePromises.push(
          fetch(
            buildUrl(path, {
              session_id: sessionId,
              sort_by: "created_at.desc",
              page,
            }),
            { cache: "no-store" },
          )
            .then((res) => res.json())
            .then((data) => data.results || [])
            .catch(() => []),
        );
      }

      // Process in batches of 5 to avoid overwhelming the API
      const batchSize = 5;
      for (let i = 0; i < pagePromises.length; i += batchSize) {
        const batch = pagePromises.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch);
        batchResults.forEach((results) => allResults.push(...results));
      }
    }

    return allResults.map((item) => ({
      ...item,
      media_type: mediaType,
    }));
  };

  try {
    const [movies, tv] = await Promise.all([
      fetchAllPages(`/account/${accountId}/watchlist/movies`, "movie"),
      fetchAllPages(`/account/${accountId}/watchlist/tv`, "tv"),
    ]);
    return [...movies, ...tv];
  } catch (e) {
    console.error("fetchWatchlistForUser error:", e);
    return [];
  }
}

export async function fetchRatedForUser(accountId, sessionId) {
  if (!accountId || !sessionId) return [];

  const fetchAllPages = async (path, mediaType) => {
    // First request to get total pages
    const firstRes = await fetch(
      buildUrl(path, {
        session_id: sessionId,
        sort_by: "created_at.desc",
        page: 1,
      }),
      { cache: "no-store" },
    );
    const firstData = await firstRes.json();
    if (!firstRes.ok)
      throw new Error(firstData?.status_message || "TMDb error");

    const totalPages = firstData.total_pages || 1;
    const allResults = [...(firstData.results || [])];

    // If there are more pages, fetch them in parallel (max 5 concurrent)
    if (totalPages > 1) {
      const pagePromises = [];
      for (let page = 2; page <= totalPages; page++) {
        pagePromises.push(
          fetch(
            buildUrl(path, {
              session_id: sessionId,
              sort_by: "created_at.desc",
              page,
            }),
            { cache: "no-store" },
          )
            .then((res) => res.json())
            .then((data) => data.results || [])
            .catch(() => []),
        );
      }

      // Process in batches of 5 to avoid overwhelming the API
      const batchSize = 5;
      for (let i = 0; i < pagePromises.length; i += batchSize) {
        const batch = pagePromises.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch);
        batchResults.forEach((results) => allResults.push(...results));
      }
    }

    return allResults.map((item) => ({
      ...item,
      media_type: mediaType,
      user_rating: item.rating || null,
    }));
  };

  try {
    const [movies, tv] = await Promise.all([
      fetchAllPages(`/account/${accountId}/rated/movies`, "movie"),
      fetchAllPages(`/account/${accountId}/rated/tv`, "tv"),
    ]);
    return [...movies, ...tv];
  } catch (e) {
    console.error("fetchRatedForUser error:", e);
    return [];
  }
}

export async function fetchTopRatedTMDb({
  type = "movie",
  page = 1,
  minVotes = 500,
} = {}) {
  const url = buildUrl(`/discover/${type}`, {
    sort_by: "vote_average.desc",
    "vote_count.gte": String(minVotes),
    page: String(page),
  });
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return [];
  return json.results || [];
}

// helper para consumir nuestra API local de IMDb top
export async function fetchTopRatedIMDb({
  type = "movie",
  pages = 3,
  limit = 20,
  minVotes = 10000,
} = {}) {
  const params = new URLSearchParams({
    type,
    pages: String(pages),
    limit: String(limit),
    minVotes: String(minVotes),
  });
  const res = await fetch(`/api/imdb/top-rated?${params.toString()}`, {
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return [];
  return json.items || [];
}

/**
 * Obtiene las películas o series más populares del momento.
 */
export const fetchPopularMedia = async ({
  type = "movie",
  language = "es-ES",
}) => {
  try {
    const data = await tmdb(`/${type}/popular`, { language, page: 1 });
    return data?.results || [];
  } catch (error) {
    console.error(`Error fetching popular ${type}:`, error);
    return [];
  }
};

/**
 * Obtiene medios por ID de género, ordenados por popularidad y con un mínimo de votos.
 * ¡ESTA ES LA FUNCIÓN QUE TE FALTA!
 */
export const fetchMediaByGenre = async ({
  type = "movie",
  language = "es-ES",
  genreId,
  minVotes = 1000,
}) => {
  try {
    const data = await tmdb(`/discover/${type}`, {
      language,
      sort_by: "popularity.desc",
      "vote_count.gte": minVotes,
      with_genres: genreId,
      page: 1,
    });
    return data?.results || [];
  } catch (error) {
    console.error(`Error fetching media by genre ${genreId}:`, error);
    return [];
  }
};

export const fetchMediaByKeyword = async ({
  type = "movie",
  language = "es-ES",
  keywordId,
  minVotes = 500,
}) => {
  try {
    const data = await tmdb(`/discover/${type}`, {
      language,
      sort_by: "popularity.desc",
      "vote_count.gte": minVotes,
      with_keywords: keywordId,
      page: 1,
    });
    return data?.results || [];
  } catch (error) {
    console.error(`Error fetching media by keyword ${keywordId}:`, error);
    return [];
  }
};

export const fetchRomanceSeriesWithGoodReviews = async ({
  language = "es-ES",
  pages = 3,
}) => {
  try {
    // Estrategia multi-fuente: muchas series populares de romance no tienen
    // el género 10749 como primario, así que combinamos varias búsquedas.
    const queries = [];

    for (let page = 1; page <= pages; page++) {
      // 1) Género Romance directo
      queries.push(
        tmdb(`/discover/tv`, {
          language,
          sort_by: "popularity.desc",
          "vote_count.gte": 50,
          with_genres: 10749,
          page,
        }),
      );
      // 2) Dramas con keyword "romance" (9840) — captura Bridgerton, Outlander, etc.
      queries.push(
        tmdb(`/discover/tv`, {
          language,
          sort_by: "popularity.desc",
          "vote_count.gte": 100,
          with_genres: 18,
          with_keywords: "9840|818",
          page,
        }),
      );
    }

    // 3) Keywords "love triangle" (11123) y "romantic drama" (2041)
    queries.push(
      tmdb(`/discover/tv`, {
        language,
        sort_by: "popularity.desc",
        "vote_count.gte": 50,
        with_keywords: "11123|2041|9840",
        page: 1,
      }),
    );

    const results = await Promise.all(queries);

    // Deduplicar por ID y unir
    const seen = new Set();
    const allResults = [];
    for (const data of results) {
      for (const item of data?.results || []) {
        if (item?.id && !seen.has(item.id)) {
          seen.add(item.id);
          allResults.push(item);
        }
      }
    }

    return allResults;
  } catch (error) {
    console.error("Error fetching romance series with good reviews:", error);
    return [];
  }
};

/* -------------------- Descubrimiento genérico -------------------- */
export async function discoverMovies(params = {}) {
  const data = await tmdb("/discover/movie", params);
  return data?.results || [];
}

export async function discoverTV(params = {}) {
  const data = await tmdb("/discover/tv", params);
  return data?.results || [];
}

/* -------------------- Secciones para páginas /movies y /series -------------------- */
// Películas — secciones principales que pediste
export async function fetchMovieSections({
  pageRand = 1,
  genreIds = [28, 35, 18, 878, 53, 16],
} = {}) {
  const makeDecade = (from, to) =>
    discoverMovies({
      "primary_release_date.gte": `${from}-01-01`,
      "primary_release_date.lte": `${to}-12-31`,
      sort_by: "popularity.desc",
      page: pageRand,
    });

  const queries = [
    // Más votadas (evita rarezas con pocos votos)
    discoverMovies({
      sort_by: "vote_average.desc",
      "vote_count.gte": 1000,
      page: pageRand,
    }),

    // Décadas
    makeDecade(1990, 1999),
    makeDecade(2000, 2009),
    makeDecade(2010, 2019),
    makeDecade(2020, new Date().getFullYear()),

    // Premiadas (proxy: muy bien valoradas y con muchos votos)
    discoverMovies({
      "vote_average.gte": 7.5,
      "vote_count.gte": 2000,
      sort_by: "vote_average.desc",
      page: pageRand,
    }),

    // Top 10 hoy en España (popularidad en región ES)
    discoverMovies({ region: "ES", sort_by: "popularity.desc", page: 1 }),

    // Superéxito (blockbusters)
    discoverMovies({
      "vote_count.gte": 5000,
      sort_by: "popularity.desc",
      page: pageRand,
    }),
  ];

  // Por género (varios grupos)
  const genrePromises = genreIds.map((gid) =>
    discoverMovies({
      with_genres: gid,
      sort_by: "popularity.desc",
      page: pageRand,
    }),
  );

  const [
    mostVoted,
    dec90,
    dec00,
    dec10,
    dec20,
    awardedProxy,
    topES,
    blockbusters,
    ...genresResults
  ] = await Promise.all([...queries, ...genrePromises]);

  const GENRE_NAMES = {
    28: "Acción",
    35: "Comedia",
    18: "Drama",
    878: "Ciencia Ficción",
    53: "Thriller",
    16: "Animación",
  };

  const byGenre = {};
  genresResults.forEach((list, idx) => {
    const gid = genreIds[idx];
    const name = GENRE_NAMES[gid] || `Género ${gid}`;
    byGenre[name] = list;
  });

  return {
    "Más votadas": mostVoted,
    "Década de 1990": dec90,
    "Década de 2000": dec00,
    "Década de 2010": dec10,
    "Década de 2020": dec20,
    Premiadas: awardedProxy,
    "Top 10 hoy en España": (topES || []).slice(0, 10),
    Superéxito: blockbusters,
    "Por género": byGenre,
  };
}

// Series — secciones principales que pediste
export async function fetchTVSections({
  pageRand = 1,
  genreIds = [18, 35, 9648, 10764, 16, 80, 10765],
} = {}) {
  const makeDecade = (from, to) =>
    discoverTV({
      "first_air_date.gte": `${from}-01-01`,
      "first_air_date.lte": `${to}-12-31`,
      sort_by: "popularity.desc",
      page: pageRand,
    });

  const queries = [
    // Más votadas (tv)
    discoverTV({
      sort_by: "vote_average.desc",
      "vote_count.gte": 500,
      page: pageRand,
    }),

    // Décadas
    makeDecade(1990, 1999),
    makeDecade(2000, 2009),
    makeDecade(2010, 2019),
    makeDecade(2020, new Date().getFullYear()),

    // Premiadas (proxy TV)
    discoverTV({
      "vote_average.gte": 7.8,
      "vote_count.gte": 1000,
      sort_by: "vote_average.desc",
      page: pageRand,
    }),

    // Top 10 hoy en España — aproximación usando trending (TV no admite region en trending)
    tmdb("/trending/tv/day", { page: 1 }),

    // Superéxito (muchos votos)
    discoverTV({
      "vote_count.gte": 2000,
      sort_by: "popularity.desc",
      page: pageRand,
    }),
  ];

  // Por género
  const genrePromises = genreIds.map((gid) =>
    discoverTV({
      with_genres: gid,
      sort_by: "popularity.desc",
      page: pageRand,
    }),
  );

  const [
    mostVoted,
    dec90,
    dec00,
    dec10,
    dec20,
    awardedProxy,
    trendingDay,
    blockbusters,
    ...genresResults
  ] = await Promise.all([...queries, ...genrePromises]);

  const GENRE_NAMES_TV = {
    18: "Drama",
    35: "Comedia",
    9648: "Misterio",
    10764: "Reality",
    16: "Animación",
    80: "Crimen",
    10765: "Ciencia Ficción y Fantasía",
  };

  const byGenre = {};
  genresResults.forEach((list, idx) => {
    const gid = genreIds[idx];
    const name = GENRE_NAMES_TV[gid] || `Género ${gid}`;
    byGenre[name] = list;
  });

  return {
    "Más votadas": mostVoted,
    "Década de 1990": dec90,
    "Década de 2000": dec00,
    "Década de 2010": dec10,
    "Década de 2020": dec20,
    Premiadas: awardedProxy,
    "Top 10 hoy en España": (trendingDay?.results || []).slice(0, 10),
    Superéxito: blockbusters,
    "Por género": byGenre,
  };
}

/* -------------------- Buckets alternativos (diversidad extra) -------------------- */
export async function fetchMovieBuckets({ pageRand = 1 } = {}) {
  const year = new Date().getFullYear();

  const queries = [
    // Clásicos bien valorados (antes de 2000)
    discoverMovies({
      "primary_release_date.lte": "2000-12-31",
      sort_by: "vote_average.desc",
      "vote_count.gte": 300,
      page: pageRand,
    }),
    // 2000s, 2010s, 2020s
    discoverMovies({
      "primary_release_date.gte": "2000-01-01",
      "primary_release_date.lte": "2009-12-31",
      sort_by: "popularity.desc",
      page: pageRand,
    }),
    discoverMovies({
      "primary_release_date.gte": "2010-01-01",
      "primary_release_date.lte": "2019-12-31",
      sort_by: "vote_count.desc",
      page: pageRand,
    }),
    discoverMovies({
      "primary_release_date.gte": "2020-01-01",
      "primary_release_date.lte": `${year}-12-31`,
      sort_by: "popularity.desc",
      page: pageRand,
    }),

    // Hidden gems
    discoverMovies({
      sort_by: "vote_average.desc",
      "vote_count.gte": 50,
      "vote_count.lte": 300,
      "vote_average.gte": 7.0,
      page: pageRand,
    }),

    // Idiomas
    discoverMovies({
      with_original_language: "es",
      sort_by: "popularity.desc",
      page: pageRand,
    }),
    discoverMovies({
      with_original_language: "fr",
      sort_by: "popularity.desc",
      page: pageRand,
    }),
    discoverMovies({
      with_original_language: "ja",
      sort_by: "popularity.desc",
      page: pageRand,
    }),

    // Géneros
    discoverMovies({
      with_genres: 28,
      sort_by: "popularity.desc",
      page: pageRand,
    }), // Acción
    discoverMovies({
      with_genres: 35,
      sort_by: "popularity.desc",
      page: pageRand,
    }), // Comedia
    discoverMovies({
      with_genres: 18,
      sort_by: "popularity.desc",
      page: pageRand,
    }), // Drama
    discoverMovies({
      with_genres: 878,
      sort_by: "popularity.desc",
      page: pageRand,
    }), // Sci-Fi
  ];

  const [
    classics,
    y2000s,
    y2010s,
    y2020s,
    hiddenGems,
    intlEs,
    intlFr,
    intlJa,
    action,
    comedy,
    drama,
    scifi,
  ] = await Promise.all(queries);

  return {
    "Clásicos bien valorados": classics,
    "Años 2000": y2000s,
    "Años 2010": y2010s,
    "Años 2020": y2020s,
    "Hidden gems": hiddenGems,
    "Cine en Español": intlEs,
    "Cine Francés": intlFr,
    "Cine Japonés": intlJa,
    Acción: action,
    Comedia: comedy,
    Drama: drama,
    "Ciencia Ficción": scifi,
  };
}

export async function fetchTVBuckets({ pageRand = 1 } = {}) {
  const queries = [
    discoverTV({ sort_by: "popularity.desc", with_genres: 18, page: pageRand }), // Drama
    discoverTV({
      sort_by: "vote_average.desc",
      "vote_count.gte": 200,
      page: pageRand,
    }), // Top nota
    discoverTV({ with_genres: 35, sort_by: "popularity.desc", page: pageRand }), // Comedia
    discoverTV({
      with_genres: 10759,
      sort_by: "popularity.desc",
      page: pageRand,
    }), // Acción/Aventura
    discoverTV({
      with_original_language: "ko",
      sort_by: "popularity.desc",
      page: pageRand,
    }), // K-Drama
    discoverTV({
      with_original_language: "en",
      sort_by: "vote_count.desc",
      page: pageRand,
    }), // Mainstream
    discoverTV({
      with_original_language: "es",
      sort_by: "popularity.desc",
      page: pageRand,
    }), // ES
  ];

  const [drama, topRated, comedy, actionAdv, kDrama, mainstream, spanish] =
    await Promise.all(queries);

  return {
    Drama: drama,
    "Top puntuadas": topRated,
    Comedia: comedy,
    "Acción y Aventura": actionAdv,
    "K-Drama": kDrama,
    Mainstream: mainstream,
    "Series en Español": spanish,
  };
}
