import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  fetchFavoritesForUser,
  fetchRatedForUser,
  fetchWatchlistForUser,
} from "@/lib/api/tmdb";
import {
  clearTraktCookies,
  getValidTraktToken,
  setTraktCookies,
  traktFetch,
} from "@/lib/trakt/server";
import {
  getTraktAnticipated,
  getTraktPopular,
  getTraktRecommended,
  getTraktTrending,
} from "@/lib/api/traktHelpers";
import { backendFetchJson, setBackendAuthCookies } from "@/lib/backend/server";
import {
  GENRES,
  describeIntent,
  genreIdsFor,
  parseWatchIntent,
} from "@/lib/ai/watchNextIntent";
import {
  RELAXED_AT_LEVEL,
  buildDiscoverQueries,
  checkCandidate,
  runtimeRange,
  scoreCandidate,
} from "@/lib/ai/watchNextCandidates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TMDB_API_KEY =
  process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL =
  process.env.OPENAI_WATCH_NEXT_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini";
const OPENAI_WATCH_NEXT_REASONING_EFFORT =
  process.env.OPENAI_WATCH_NEXT_REASONING_EFFORT || "low";
const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";
const GEMINI_MODEL =
  process.env.GEMINI_WATCH_NEXT_MODEL ||
  process.env.GEMINI_MODEL ||
  "gemini-2.5-flash";
// IA LOCAL (Ollama del NAS): proveedor por DEFECTO cuando no hay claves cloud, para
// recomendaciones privadas sin coste. En el compose del NAS el contenedor web
// alcanza el servicio en `http://ollama:11434`; en dev local se apunta por LAN vía
// .env.local (OLLAMA_BASE_URL=http://192.168.1.126:11434).
const OLLAMA_BASE_URL = (
  process.env.OLLAMA_BASE_URL || "http://ollama:11434"
).replace(/\/+$/, "");
const OLLAMA_MODEL =
  process.env.OLLAMA_WATCH_NEXT_MODEL ||
  process.env.OLLAMA_MODEL ||
  "qwen2.5:1.5b";
const OLLAMA_TIMEOUT_MS =
  Number(process.env.OLLAMA_WATCH_NEXT_TIMEOUT_MS) || 45000;
// El modelo local corre por CPU (~8 tok/s). Dos costes dominan la latencia:
// (1) el prefill del prompt y (2) la generación. Por eso: pocos candidatos (menos
// prefill) y una salida MÍNIMA — solo las `keys` elegidas; el reply, el motivo y
// las etiquetas se generan localmente (buildSelectionReply/buildReason/tags de
// origen), que además salen de mayor calidad que la prosa del modelo 1.5b.
const OLLAMA_MAX_CANDIDATES =
  Number(process.env.OLLAMA_WATCH_NEXT_MAX_CANDIDATES) || 10;
const WATCH_NEXT_AI_PROVIDER =
  process.env.WATCH_NEXT_AI_PROVIDER ||
  (GEMINI_API_KEY ? "gemini" : OPENAI_API_KEY ? "openai" : "ollama");
// Ollama no tiene "clave": se considera IA disponible si está en la lista de
// proveedores (no depende de una key como openai/gemini).
const OLLAMA_ENABLED = String(WATCH_NEXT_AI_PROVIDER)
  .toLowerCase()
  .split(",")
  .some((p) => p.trim() === "ollama");

const WATCH_NEXT_RESPONSE_FORMAT = {
  type: "json_schema",
  name: "watch_next_recommendations",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      reply: {
        type: "string",
        description: "Respuesta breve en español que explique el criterio general.",
      },
      recommendations: {
        type: "array",
        minItems: 1,
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            key: {
              type: "string",
              description: "Clave exacta del candidato elegido, por ejemplo movie:123.",
            },
            reason: {
              type: "string",
              description: "Motivo concreto, en español, para recomendar este título.",
            },
            matchTags: {
              type: "array",
              minItems: 1,
              maxItems: 4,
              items: { type: "string" },
            },
          },
          required: ["key", "reason", "matchTags"],
        },
      },
    },
    required: ["reply", "recommendations"],
  },
};

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function mediaTypeOf(item) {
  if (item?.media_type === "tv" || item?.media_type === "show") return "tv";
  if (item?.media_type === "movie") return "movie";
  if (item?.name && !item?.title) return "tv";
  return "movie";
}

function yearOf(item) {
  const date = item?.release_date || item?.first_air_date || "";
  const year = item?.year || String(date).slice(0, 4);
  return /^\d{4}$/.test(String(year)) ? String(year) : "";
}

function releaseDateOf(item) {
  return item?.release_date || item?.first_air_date || null;
}

function normalizeItem(item, source = "base") {
  if (!item?.id) return null;
  const mediaType = mediaTypeOf(item);
  const title = mediaType === "movie" ? item?.title || item?.name : item?.name || item?.title;
  if (!title) return null;

  return {
    id: Number(item.id),
    mediaType,
    title,
    year: yearOf(item),
    posterPath: item?.poster_path || null,
    backdropPath: item?.backdrop_path || null,
    overview: item?.overview || "",
    releaseDate: releaseDateOf(item),
    voteAverage:
      typeof item?.vote_average === "number" ? Number(item.vote_average) : null,
    voteCount: typeof item?.vote_count === "number" ? Number(item.vote_count) : null,
    popularity: typeof item?.popularity === "number" ? item.popularity : 0,
    genreIds: safeArray(item?.genre_ids).map(Number).filter(Number.isFinite),
    originalLanguage: item?.original_language || null,
    originCountry: safeArray(item?.origin_country),
    userRating:
      typeof item?.user_rating === "number" ? Number(item.user_rating) : null,
    sources: [source],
    // Criterios que la búsqueda de la que salió ya garantiza (ver
    // buildDiscoverQueries) y cómo encajó con los géneros pedidos.
    verified: [],
    genreMatch: null,
    score: 0,
  };
}

function normalizeTraktHistoryItem(item) {
  if (item?.movie) {
    return {
      id: item.movie?.ids?.tmdb || null,
      mediaType: "movie",
      title: item.movie?.title || "",
      year: item.movie?.year || "",
      watchedAt: item.watched_at || null,
    };
  }

  if (item?.show) {
    return {
      id: item.show?.ids?.tmdb || null,
      mediaType: "tv",
      title: item.show?.title || "",
      year: item.show?.year || "",
      watchedAt: item.watched_at || null,
    };
  }

  return null;
}

function itemKey(item) {
  return `${item?.mediaType || mediaTypeOf(item)}:${Number(item?.id || 0)}`;
}

function addCandidates(map, items, source, baseScore = 0, { mediaType = null, verified = [], genreMatch = null } = {}) {
  for (const raw of safeArray(items)) {
    // Los resultados de /discover/{tipo} y /{tipo}/{id}/recommendations no
    // traen `media_type`: lo pone quien sabe de dónde salen.
    const item = normalizeItem(mediaType && !raw?.media_type ? { ...raw, media_type: mediaType } : raw, source);
    if (!item) continue;
    const key = itemKey(item);
    const prev = map.get(key);
    if (prev) {
      prev.sources = Array.from(new Set([...prev.sources, source]));
      prev.score += baseScore;
      prev.voteAverage = prev.voteAverage ?? item.voteAverage;
      prev.voteCount = prev.voteCount ?? item.voteCount;
      prev.popularity = Math.max(prev.popularity || 0, item.popularity || 0);
      prev.genreIds = Array.from(new Set([...prev.genreIds, ...item.genreIds]));
      prev.originalLanguage = prev.originalLanguage || item.originalLanguage;
      if (!prev.originCountry?.length) prev.originCountry = item.originCountry;
      if (!prev.posterPath && item.posterPath) prev.posterPath = item.posterPath;
      if (!prev.backdropPath && item.backdropPath) prev.backdropPath = item.backdropPath;
      if (!prev.overview && item.overview) prev.overview = item.overview;
      if (!prev.releaseDate && item.releaseDate) prev.releaseDate = item.releaseDate;
      prev.verified = Array.from(new Set([...(prev.verified || []), ...verified]));
      if (genreMatch === "all" || !prev.genreMatch) prev.genreMatch = genreMatch || prev.genreMatch;
    } else {
      item.score = baseScore;
      item.verified = [...verified];
      item.genreMatch = genreMatch;
      map.set(key, item);
    }
  }
}

async function tmdbList(path, params = {}) {
  if (!TMDB_API_KEY) return [];
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", TMDB_API_KEY);
  url.searchParams.set("language", "es-ES");
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url, { next: { revalidate: 60 * 30 } });
  const json = await safeJson(res);
  return res.ok ? safeArray(json?.results) : [];
}

async function getTmdbFallbackCandidates(limit = 30) {
  const [movies, shows] = await Promise.all([
    tmdbList("/movie/popular", { page: 1 }).catch(() => []),
    tmdbList("/tv/popular", { page: 1 }).catch(() => []),
  ]);

  return [...movies, ...shows]
    .filter((item) => item?.media_type !== "person")
    .slice(0, limit);
}

async function getTmdbNoveltyCandidates(limit = 40) {
  const [
    nowPlaying,
    upcoming,
    onTheAir,
    airingToday,
    weeklyTrending,
  ] = await Promise.all([
    tmdbList("/movie/now_playing", { page: 1, region: "ES" }).catch(() => []),
    tmdbList("/movie/upcoming", { page: 1, region: "ES" }).catch(() => []),
    tmdbList("/tv/on_the_air", { page: 1 }).catch(() => []),
    tmdbList("/tv/airing_today", { page: 1 }).catch(() => []),
    tmdbList("/trending/all/week", { page: 1 }).catch(() => []),
  ]);

  return {
    nowPlaying: nowPlaying.slice(0, limit),
    upcoming: upcoming.slice(0, limit),
    onTheAir: onTheAir.slice(0, limit),
    airingToday: airingToday.slice(0, limit),
    weeklyTrending: weeklyTrending
      .filter((item) => item?.media_type !== "person")
      .slice(0, limit),
  };
}

// Búsquedas de /discover que ya cumplen los criterios del mensaje (plataforma,
// minutos, nota, fechas, idioma, géneros…), ver buildDiscoverQueries.
async function runDiscoverQueries(intent, today) {
  const queries = buildDiscoverQueries(intent, { today, region: "ES" });
  const results = await Promise.all(
    queries.map((query) =>
      tmdbList(query.path, query.params)
        .then((items) => ({ query, items }))
        .catch(() => ({ query, items: [] })),
    ),
  );
  return results;
}

async function tmdbJson(path, params = {}, revalidate = 60 * 60 * 12) {
  if (!TMDB_API_KEY) return null;
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", TMDB_API_KEY);
  url.searchParams.set("language", "es-ES");
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  const res = await fetch(url, { next: { revalidate } });
  return res.ok ? safeJson(res) : null;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index], index).catch(() => null);
    }
  });
  await Promise.all(workers);
  return out;
}

// «Parecida a X»: busca X en TMDb y trae sus recomendaciones y similares.
// «Parecida a mis favoritas»: lo mismo con las últimas favoritas.
async function getSimilarCandidates(intent, favorites) {
  const seeds = [];
  if (intent.similar?.title) {
    const results = await tmdbList("/search/multi", { query: intent.similar.title, include_adult: false }).catch(() => []);
    const wanted = normalizedTitle(intent.similar.title);
    const media = results.filter((r) => r?.media_type === "movie" || r?.media_type === "tv");
    const exact = media.find((r) => normalizedTitle(r.title || r.name) === wanted);
    const seed = exact || media[0];
    if (seed) seeds.push({ id: seed.id, mediaType: seed.media_type, title: seed.title || seed.name, source: "similar" });
  } else if (intent.similar?.favorites) {
    for (const fav of safeArray(favorites).slice(0, 4)) {
      seeds.push({ id: Number(fav.id), mediaType: mediaTypeOf(fav), title: fav.title || fav.name, source: "similar_favorites" });
    }
  }
  if (!seeds.length) return { seeds, lists: [] };

  const lists = await Promise.all(
    seeds.flatMap((seed) => [
      tmdbList(`/${seed.mediaType}/${seed.id}/recommendations`, { page: 1 })
        .then((items) => ({ seed, items }))
        .catch(() => ({ seed, items: [] })),
      tmdbList(`/${seed.mediaType}/${seed.id}/similar`, { page: 1 })
        .then((items) => ({ seed, items: items.slice(0, 10) }))
        .catch(() => ({ seed, items: [] })),
    ]),
  );
  return { seeds, lists };
}

// Ficha de un candidato que no salió de una búsqueda que garantice duración o
// plataforma (Pendientes, tendencias, similares): minutos, plataformas en
// España, idioma, país, géneros y votos.
async function getTitleFacts(item) {
  const json = await tmdbJson(`/${item.mediaType}/${item.id}`, { append_to_response: "watch/providers" });
  if (!json) return null;
  const es = json?.["watch/providers"]?.results?.ES || {};
  const providerIds = [...safeArray(es.flatrate), ...safeArray(es.free), ...safeArray(es.ads)]
    .map((p) => Number(p?.provider_id))
    .filter(Number.isFinite);
  const episodeRuntime =
    Number(safeArray(json.episode_run_time)[0]) ||
    Number(json.last_episode_to_air?.runtime) ||
    Number(json.next_episode_to_air?.runtime) ||
    null;
  return {
    runtime: Number(json.runtime) || null,
    episodeRuntime: episodeRuntime || null,
    providerIds,
    originalLanguage: json.original_language || null,
    originCountry: safeArray(json.origin_country),
    genreIds: safeArray(json.genres).map((g) => Number(g?.id)).filter(Number.isFinite),
    voteCount: typeof json.vote_count === "number" ? json.vote_count : null,
    voteAverage: typeof json.vote_average === "number" ? json.vote_average : null,
    releaseDate: json.release_date || json.first_air_date || null,
    numberOfSeasons: Number(json.number_of_seasons) || null,
  };
}

// Pendientes, favoritos, valoraciones e historial del backend propio (lo que
// el usuario ve en la app). Sin sesión del backend, `connected: false` y se
// usan los de TMDb/Trakt.
function mapBackendItem(row) {
  const mediaType = row?.mediaType === "movie" ? "movie" : "tv";
  return {
    id: Number(row?.tmdbId),
    media_type: mediaType,
    title: row?.title || null,
    name: row?.title || null,
    poster_path: row?.posterPath || null,
    backdrop_path: row?.backdropPath || null,
    release_date: row?.releaseDate || null,
    first_air_date: row?.firstAirDate || null,
    year: row?.year || null,
    genre_ids: safeArray(row?.genreIds),
    overview: row?.overview || "",
    vote_average: typeof row?.voteAverage === "number" ? row.voteAverage : undefined,
    user_rating: typeof row?.userRating === "number" ? row.userRating : typeof row?.rating === "number" ? row.rating : undefined,
  };
}

async function getBackendLibrary(request) {
  const [watchlist, favorites, ratings, history] = await Promise.all([
    backendFetchJson(request, "/v1/watchlist?limit=500").catch(() => null),
    backendFetchJson(request, "/v1/favorites?limit=200").catch(() => null),
    backendFetchJson(request, "/v1/ratings?limit=300").catch(() => null),
    backendFetchJson(request, "/v1/history?limit=1500").catch(() => null),
  ]);
  const ok = (r) => r?.ok && Array.isArray(r.json?.results);
  const rows = (r) => (ok(r) ? r.json.results : []);
  const historyKeys = new Set(
    rows(history)
      .filter((row) => row?.tmdbId)
      .map((row) => `${row.mediaType === "movie" ? "movie" : "tv"}:${Number(row.tmdbId)}`),
  );
  return {
    connected: [watchlist, favorites, ratings, history].some(ok),
    watchlist: rows(watchlist).map(mapBackendItem).filter((x) => x.id),
    favorites: rows(favorites).map(mapBackendItem).filter((x) => x.id),
    rated: rows(ratings).map(mapBackendItem).filter((x) => x.id),
    historyKeys,
    // La última respuesta con tokens renovados, para devolverlos en cookies.
    authResult: [watchlist, favorites, ratings, history].find((r) => r?.refreshedTokens) || null,
  };
}

async function getTmdbAccount(sessionId) {
  if (!TMDB_API_KEY || !sessionId) return null;
  const url = `${TMDB_BASE}/account?api_key=${encodeURIComponent(
    TMDB_API_KEY,
  )}&session_id=${encodeURIComponent(sessionId)}`;
  const res = await fetch(url, { cache: "no-store" });
  const json = await safeJson(res);
  return res.ok ? json : null;
}

async function getTmdbContext(cookieStore) {
  const sessionId = cookieStore.get("tmdb_session_id")?.value || null;
  if (!sessionId) {
    return {
      connected: false,
      favorites: [],
      watchlist: [],
      rated: [],
    };
  }

  try {
    const account = await getTmdbAccount(sessionId);
    if (!account?.id) throw new Error("TMDb account unavailable");
    const [favorites, watchlist, rated] = await Promise.all([
      fetchFavoritesForUser(account.id, sessionId),
      fetchWatchlistForUser(account.id, sessionId),
      fetchRatedForUser(account.id, sessionId),
    ]);

    return {
      connected: true,
      account: { id: account.id, username: account.username || account.name || null },
      favorites: safeArray(favorites),
      watchlist: safeArray(watchlist),
      rated: safeArray(rated),
    };
  } catch {
    return {
      connected: false,
      favorites: [],
      watchlist: [],
      rated: [],
    };
  }
}

async function getTraktContext(cookieStore) {
  try {
    const { token, refreshedTokens, shouldClear } =
      await getValidTraktToken(cookieStore);
    if (!token) {
      return { connected: false, history: [], ratings: [], refreshedTokens, shouldClear };
    }

    const [historyRes, movieRatingsRes, showRatingsRes] = await Promise.all([
      traktFetch("/sync/history?extended=full&page=1&limit=120", {
        token,
        timeoutMs: 9000,
      }),
      traktFetch("/sync/ratings/movies?extended=full&page=1&limit=100", {
        token,
        timeoutMs: 9000,
      }),
      traktFetch("/sync/ratings/shows?extended=full&page=1&limit=100", {
        token,
        timeoutMs: 9000,
      }),
    ]);

    const history = historyRes.ok
      ? safeArray(historyRes.json).map(normalizeTraktHistoryItem).filter((x) => x?.id)
      : [];
    const ratings = [
      ...(movieRatingsRes.ok ? safeArray(movieRatingsRes.json) : []).map((it) => ({
        rating: it?.rating,
        item: it?.movie,
        mediaType: "movie",
      })),
      ...(showRatingsRes.ok ? safeArray(showRatingsRes.json) : []).map((it) => ({
        rating: it?.rating,
        item: it?.show,
        mediaType: "tv",
      })),
    ];

    return {
      connected: true,
      history,
      ratings,
      refreshedTokens,
      shouldClear,
    };
  } catch {
    return { connected: false, history: [], ratings: [] };
  }
}

function normalizeRecentKeys(value) {
  return [
    ...new Set(
      safeArray(value)
        .map((key) => String(key || "").trim())
        .filter((key) => /^(movie|tv):\d+$/.test(key)),
    ),
  ].slice(0, 80);
}

function clampRecommendationLimit(value, fallback = 5) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(8, Math.trunc(n)));
}

function inferFavoriteGenres({ favorites, rated, traktRatings }) {
  const counts = new Map();
  const add = (item, weight = 1) => {
    for (const id of safeArray(item?.genre_ids)) {
      const n = Number(id);
      if (!Number.isFinite(n)) continue;
      counts.set(n, (counts.get(n) || 0) + weight);
    }
  };

  for (const item of safeArray(favorites)) add(item, 2);
  for (const item of safeArray(rated)) {
    const rating = Number(item?.user_rating || 0);
    if (rating >= 7) add(item, rating >= 9 ? 3 : 1.5);
  }
  for (const rating of safeArray(traktRatings)) {
    if (Number(rating?.rating || 0) >= 8) add(rating.item, 1.5);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id]) => id);
}

function primarySource(item) {
  const sources = safeArray(item?.sources);
  return (
    sources.find((source) => source === "watchlist") ||
    sources.find((source) => source.startsWith("tmdb_")) ||
    sources.find((source) => source.startsWith("trakt_")) ||
    sources[0] ||
    "unknown"
  );
}

function genreSimilarity(a, b) {
  const aGenres = new Set(safeArray(a?.genreIds));
  const bGenres = new Set(safeArray(b?.genreIds));
  if (!aGenres.size || !bGenres.size) return 0;
  let intersection = 0;
  for (const id of aGenres) {
    if (bGenres.has(id)) intersection += 1;
  }
  return intersection / new Set([...aGenres, ...bGenres]).size;
}

function normalizedTitle(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleLooksTooSimilar(a, b) {
  const left = normalizedTitle(a?.title);
  const right = normalizedTitle(b?.title);
  if (!left || !right) return false;
  return (
    left === right ||
    left.startsWith(`${right} `) ||
    right.startsWith(`${left} `)
  );
}

function diversifyRecommendations({
  candidates,
  limit,
  intent,
  recentKeySet,
  quickPick = false,
}) {
  const wantedType = intent.mediaType;
  const selected = [];
  const pool = safeArray(candidates).filter((item) => item?.id && item?.mediaType);

  const sourceCounts = new Map();
  const typeCounts = new Map();

  while (selected.length < limit && pool.length) {
    let bestIndex = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < pool.length; i++) {
      const item = pool[i];
      const key = itemKey(item);
      const source = primarySource(item);
      let penalty = 0;

      if (recentKeySet?.has(key)) penalty += quickPick ? 95 : 70;
      if (!wantedType) penalty += (typeCounts.get(item.mediaType) || 0) * 10;
      // Con criterios concretos, que todo venga de la misma búsqueda no es
      // un defecto: la variedad de origen pesa poco.
      penalty += (sourceCounts.get(source) || 0) * (intent.hasConstraints ? 2 : 8);

      for (const picked of selected) {
        // Si pidió un género, que se repita es lo esperado.
        penalty += genreSimilarity(item, picked) * (intent.genres.length ? 6 : 20);
        // Misma saga («Narcos» y «Narcos: México»): casi nunca las dos.
        if (titleLooksTooSimilar(item, picked)) penalty += 400;
        if (item.year && picked.year && item.year === picked.year) penalty += 3;
      }

      // Lo que no cumple todos los criterios (relajado) va siempre detrás.
      const relevance = Number(item.score || 0) - (item.relaxedLevel || 0) * 400;
      const finalScore = relevance * 0.72 - penalty * 0.28;
      if (finalScore > bestScore) {
        bestScore = finalScore;
        bestIndex = i;
      }
    }

    if (bestIndex < 0) break;
    const [picked] = pool.splice(bestIndex, 1);
    selected.push(picked);
    const source = primarySource(picked);
    sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
    typeCounts.set(picked.mediaType, (typeCounts.get(picked.mediaType) || 0) + 1);
  }

  return selected.slice(0, limit);
}

function genreLabelsOf(item) {
  const labels = [];
  for (const def of Object.values(GENRES)) {
    if ((def[item.mediaType] || []).some((id) => (item.genreIds || []).includes(id))) labels.push(def.label);
  }
  return [...new Set(labels)];
}

function providerLabelsOf(item, intent) {
  const ids = new Set(item.providerIds || []);
  return (intent.providers || [])
    .filter((p) => (item.verified || []).includes("providers") || p.ids.some((id) => ids.has(id)))
    .map((p) => p.label);
}

// Motivo de cada título a partir de lo que encaja con la petición (lo que
// cumple), no de su origen.
function buildReason(item, intent) {
  const bits = [];
  const wanted = genreIdsFor(intent.genres, item.mediaType);
  const genreHits = Object.entries(GENRES)
    .filter(([key, def]) => intent.genres.includes(key) && (def[item.mediaType] || []).some((id) => item.genreIds.includes(id)))
    .map(([, def]) => def.label);
  if (genreHits.length) bits.push(genreHits.join(" y "));
  else if (wanted.length === 0 && genreLabelsOf(item).length) bits.push(genreLabelsOf(item).slice(0, 2).join(" y "));
  const minutes = item.mediaType === "tv" ? item.episodeRuntime : item.runtime;
  if (Number.isFinite(minutes) && minutes > 0) {
    bits.push(item.mediaType === "tv" ? `episodios de ${minutes} min` : `${minutes} min`);
  }
  const providers = providerLabelsOf(item, intent);
  if (providers.length) bits.push(`en ${providers.join(" y ")}`);
  if (intent.inCinemas) bits.push("en cartelera");
  if (item.voteAverage) bits.push(`nota ${Number(item.voteAverage).toFixed(1)}`);
  if (item.sources.includes("similar") && intent.similar?.seedTitle) bits.push(`en la línea de ${intent.similar.seedTitle}`);
  if (item.sources.includes("similar_favorites")) bits.push("en la línea de tus favoritas");
  if (item.sources.includes("watchlist")) bits.push("la tienes en Pendientes");
  if (!intent.hasIntent) {
    if (item.sources.includes("tmdb_now_playing")) bits.push("recién estrenada en cines");
    else if (item.sources.includes("tmdb_on_the_air")) bits.push("en emisión");
    else if (item.sources.some((s) => s.includes("trending"))) bits.push("en tendencia");
  }
  if (!bits.length) bits.push("encaja con tu perfil");
  const text = bits.slice(0, 4).join(" · ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

function serializeRecommendation(item, intent) {
  const tags = [];
  if (item.sources.includes("watchlist")) tags.push("Pendiente");
  const genreHits = Object.entries(GENRES)
    .filter(([key, def]) => intent.genres.includes(key) && (def[item.mediaType] || []).some((id) => item.genreIds.includes(id)))
    .map(([, def]) => def.label);
  for (const label of genreHits.length ? genreHits : genreLabelsOf(item).slice(0, 1)) {
    tags.push(label.charAt(0).toUpperCase() + label.slice(1));
  }
  for (const label of providerLabelsOf(item, intent)) tags.push(label);
  if (intent.inCinemas || item.sources.includes("tmdb_now_playing")) tags.push("En cines");
  if (item.sources.includes("tmdb_on_the_air")) tags.push("En emisión");
  if (!intent.hasIntent && item.sources.some((s) => s.includes("trending"))) tags.push("Tendencia");
  if (item.voteAverage >= 7.5 && (item.voteCount == null || item.voteCount >= 200)) tags.push("Valoración alta");

  return {
    id: item.id,
    mediaType: item.mediaType,
    title: item.title,
    year: item.year,
    posterPath: item.posterPath,
    backdropPath: item.backdropPath,
    voteAverage: item.voteAverage,
    href: `/details/${item.mediaType}/${item.id}`,
    reason: item.reason || buildReason(item, intent),
    matchTags: item.matchTags || [...new Set(tags)].slice(0, 3),
  };
}

// Qué criterio no se pudo cumplir del todo, dicho para el usuario.
const RELAXED_LABELS = {
  rating: "la nota mínima",
  years: "la época",
  runtime: "la duración exacta",
  genres: "el género",
  keywords: "el tema concreto",
  similar: "el parecido",
};

function buildSelectionReply({ intent, selected, contextSummary, quickPick, relaxed, watchlistHits, seedTitle, emptyReason }) {
  const count = safeArray(selected).length;
  if (emptyReason) return emptyReason;
  if (quickPick) {
    return `He elegido ${count || 3} opciones variadas para decidir rápido, evitando lo que ya te recomendé hace poco.`;
  }

  const parts = [];
  if (intent.hasIntent) {
    const criteria = describeIntent({ ...intent, similar: seedTitle ? { title: seedTitle } : intent.similar });
    parts.push(`He buscado ${criteria}.`);
  } else {
    parts.push(
      contextSummary.watchlistCount || contextSummary.favoritesCount || contextSummary.historyCount
        ? "He combinado tus pendientes y tus gustos con novedades y tendencias."
        : "Sin mucho contexto tuyo todavía, he tirado de novedades, tendencias y títulos muy bien valorados.",
    );
  }
  if (watchlistHits > 0 && !intent.onlyWatchlist) {
    parts.push(
      watchlistHits === 1
        ? "Una de ellas la tienes en Pendientes."
        : `${watchlistHits} de ellas las tienes en Pendientes.`,
    );
  }
  if (relaxed?.length) {
    parts.push(
      `No había suficientes que lo cumplieran todo, así que en alguna he relajado ${relaxed.map((r) => RELAXED_LABELS[r] || r).join(" y ")}.`,
    );
  }
  return parts.join(" ");
}

function extractOutputText(json) {
  if (typeof json?.output_text === "string") return json.output_text;
  const chunks = [];
  for (const out of safeArray(json?.output)) {
    for (const content of safeArray(out?.content)) {
      if (typeof content?.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

function parseJsonLoose(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text).match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function compactCandidatesForAi(candidates, intent) {
  return safeArray(candidates).slice(0, 30).map((item) => ({
    key: itemKey(item),
    title: item.title,
    type: item.mediaType === "tv" ? "serie" : "película",
    year: item.year,
    genres: genreLabelsOf(item),
    voteAverage: item.voteAverage,
    votes: item.voteCount,
    minutes: (item.mediaType === "tv" ? item.episodeRuntime : item.runtime) || undefined,
    onPlatforms: providerLabelsOf(item, intent),
    inWatchlist: item.sources.includes("watchlist") || undefined,
    // Cumple solo parte de lo pedido (se relajó algún criterio).
    partialMatch: item.relaxedLevel ? true : undefined,
    overview: item.overview ? item.overview.slice(0, 220) : "",
  }));
}

function buildAiSystemPrompt() {
  return [
    "Eres un recomendador experto de cine y series para The Show Verse. Tu misión es elegir exactamente entre 4 y 6 títulos de la lista de candidatos.",
    "REGLAS ESTRICTAS:",
    "1. Elige ÚNICAMENTE títulos de 'candidates', con su 'key' exacta. No inventes títulos ni claves.",
    "2. Los candidatos ya cumplen los criterios de 'criteria' (género, duración, nota, plataforma, época…). Ordénalos por lo bien que encajan con la intención del usuario, incluido el tono o el ánimo que pide (ligero, para llorar, que dé miedo, para pensar…), usando la sinopsis.",
    "3. Evita los que tengan 'partialMatch' salvo que no haya suficientes que encajen del todo.",
    "4. Si un candidato tiene 'inWatchlist' y encaja tan bien como otro, prefiérelo: el usuario ya quería verlo.",
    "5. Mezcla películas y series solo si el usuario no pidió un tipo concreto. Evita títulos casi iguales o de la misma saga.",
    "6. 'reason': máximo 2 frases, en español, explicando por qué encaja con LO QUE PIDE el usuario.",
    "7. 'matchTags': 2-3 etiquetas cortas en español (ej: 'Comedia', 'En Netflix', 'Valoración alta', 'Pendiente').",
    "8. 'reply': 1-2 frases en español con el criterio general.",
    "FORMATO DE RESPUESTA (JSON estricto):",
    '{"reply":"string","recommendations":[{"key":"movie:123","reason":"string","matchTags":["string"]}]}',
  ].join(" ");
}

function buildAiUserPayload({ message, candidates, contextSummary, intent }) {
  const compactCandidates = compactCandidatesForAi(candidates, intent);
  return JSON.stringify({
    userRequest: message,
    criteria: intent?.hasIntent ? describeIntent(intent) : "sin criterios concretos: variedad, novedades y afinidad",
    moods: intent?.moods || [],
    user:
      contextSummary.backendConnected || contextSummary.traktConnected || contextSummary.tmdbConnected
        ? `${contextSummary.historyCount} títulos vistos, ${contextSummary.favoritesCount} favoritos, ${contextSummary.watchlistCount} pendientes, ${contextSummary.ratedCount} valorados.`
        : "sin datos personales",
    candidates: compactCandidates,
  });
}

function normalizeAiSelection({ parsed, candidates }) {
  if (!parsed?.recommendations?.length) return null;

  const byKey = new Map(candidates.map((item) => [itemKey(item), item]));
  const byId = new Map(
    candidates.map((item) => [`${item.mediaType}:${Number(item.id)}`, item]),
  );
  const byBareId = new Map(
    candidates.map((item) => [String(Number(item.id)), item]),
  );
  const byBareTitle = new Map(
    candidates.map((item) => [String(item.title || "").trim().toLowerCase(), item]),
  );
  const byTitle = new Map(
    candidates.map((item) => [
      `${item.mediaType}:${String(item.title || "").trim().toLowerCase()}`,
      item,
    ]),
  );
  const selected = parsed.recommendations
    .map((rec) => {
      const explicitKey = String(rec?.key || "").trim();
      const derivedKey =
        rec?.mediaType && rec?.id
          ? `${rec.mediaType === "show" ? "tv" : rec.mediaType}:${Number(rec.id)}`
          : "";
      const titleKey =
        rec?.mediaType && rec?.title
          ? `${rec.mediaType === "show" ? "tv" : rec.mediaType}:${String(rec.title).trim().toLowerCase()}`
          : "";
      const item =
        byKey.get(explicitKey) ||
        byKey.get(derivedKey) ||
        byId.get(derivedKey) ||
        byBareId.get(explicitKey) ||
        byTitle.get(titleKey) ||
        byBareTitle.get(String(rec?.title || "").trim().toLowerCase());
      if (!item) return null;
      const aiTags = safeArray(rec.matchTags).slice(0, 4);
      return {
        ...item,
        reason: String(rec.reason || "").trim() || null,
        // Si el proveedor no aporta etiquetas (p. ej. el path keys-only de Ollama),
        // se deja undefined para que serializeRecommendation derive las de origen.
        matchTags: aiTags.length ? aiTags : undefined,
      };
    })
    .filter(Boolean)
    .slice(0, 8);

  if (!selected.length) return null;

  return {
    reply:
      typeof parsed.reply === "string" && parsed.reply.trim()
        ? parsed.reply.trim()
        : null,
    recommendations: selected,
  };
}

function openAiRequestBody(input) {
  const body = {
    model: OPENAI_MODEL,
    max_output_tokens: 1800,
    store: false,
    text: {
      format: WATCH_NEXT_RESPONSE_FORMAT,
      verbosity: "low",
    },
    input,
  };

  if (/^gpt-5/i.test(OPENAI_MODEL)) {
    body.reasoning = { effort: OPENAI_WATCH_NEXT_REASONING_EFFORT };
  } else {
    body.temperature = 0.35;
  }

  return body;
}

async function getOpenAiRecommendation({ message, candidates, contextSummary, intent }) {
  if (!OPENAI_API_KEY) return null;

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(
      openAiRequestBody([
        {
          role: "system",
          content: buildAiSystemPrompt(),
        },
        {
          role: "user",
          content: buildAiUserPayload({ message, candidates, contextSummary, intent }),
        },
      ]),
    ),
    cache: "no-store",
  });

  const json = await safeJson(res);
  if (!res.ok) {
    console.warn("[watch-next] OpenAI fallback:", {
      status: res.status,
      code: json?.error?.code || json?.error?.type || "unknown",
    });
    return null;
  }
  const parsed = parseJsonLoose(extractOutputText(json));
  const normalized = normalizeAiSelection({ parsed, candidates, message });
  if (!normalized) return null;

  return {
    reply: normalized.reply || null,
    recommendations: normalized.recommendations,
    provider: "openai",
  };
}

function extractGeminiText(json) {
  // Handle direct JSON object response (when responseMimeType is application/json)
  const candidate = json?.candidates?.[0];
  if (!candidate) return "";

  const parts = safeArray(candidate?.content?.parts);
  const text = parts
    .map((part) => {
      // Parts can have 'text' directly (for JSON mime type responses, the text IS the JSON)
      if (typeof part?.text === "string") return part.text;
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();

  return text;
}

async function getGeminiRecommendation({ message, candidates, contextSummary, intent }) {
  if (!GEMINI_API_KEY) return null;

  const model = encodeURIComponent(GEMINI_MODEL);

  // Build generation config — thinkingBudget only for models that support it
  const isThinkingModel = /thinking|exp/i.test(GEMINI_MODEL);
  const generationConfig = {
    temperature: 0.4,
    maxOutputTokens: 2048,
    responseMimeType: "application/json",
    ...(isThinkingModel ? { thinkingConfig: { thinkingBudget: 512 } } : {}),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  let res;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: buildAiSystemPrompt() }],
          },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: buildAiUserPayload({
                    message,
                    candidates,
                    contextSummary,
                    intent,
                  }),
                },
              ],
            },
          ],
          generationConfig,
        }),
        cache: "no-store",
        signal: controller.signal,
      },
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const json = await safeJson(res);
  if (!res.ok) {
    console.warn("[watch-next] Gemini error:", {
      status: res.status,
      code: json?.error?.status || json?.error?.code || "unknown",
      message: json?.error?.message?.slice(0, 120) || "unknown",
    });
    return null;
  }

  const rawText = extractGeminiText(json);
  if (!rawText) {
    // Log finish reason for debugging
    const finishReason = json?.candidates?.[0]?.finishReason;
    console.warn("[watch-next] Gemini empty response:", { finishReason });
    return null;
  }

  const parsed = parseJsonLoose(rawText);
  if (!parsed?.recommendations?.length) {
    console.warn("[watch-next] Gemini invalid JSON:", {
      rawText: rawText.slice(0, 200),
    });
    return null;
  }
  const normalized = normalizeAiSelection({ parsed, candidates, message });
  if (!normalized) {
    console.warn("[watch-next] Gemini no candidate match:", {
      keys: parsed.recommendations.map((r) => r?.key).join(", "),
    });
    return null;
  }

  return {
    reply: normalized.reply || null,
    recommendations: normalized.recommendations,
    provider: "gemini",
  };
}

// Prompt LEAN para Ollama: el modelo solo tiene que SELECCIONAR keys. Nada de
// reglas de formato de reply/reason/matchTags (se generan en el server), así el
// prompt es corto (menos prefill) y el foco del modelo es la relevancia. Los
// candidatos ya cumplen los criterios; el modelo decide cuáles encajan mejor
// con el tono de la petición.
function buildOllamaMessages({ message, candidates, intent }) {
  const slim = candidates.map((item) => ({
    key: itemKey(item),
    title: item.title,
    year: item.year || null,
    type: item.mediaType === "tv" ? "serie" : "pelicula",
    genres: genreLabelsOf(item).slice(0, 3),
    pending: item.sources.includes("watchlist") || undefined,
    partial: item.relaxedLevel ? true : undefined,
  }));
  const system = [
    "Eres un recomendador de cine y series para The Show Verse.",
    "Tu ÚNICA tarea: elegir ENTRE 4 Y 6 títulos de la lista 'candidates' que mejor encajen con la petición del usuario.",
    "Devuelve solo sus 'key' EXACTAS (tal cual aparecen). No inventes claves ni títulos.",
    "Los candidatos ya cumplen los criterios; elige los que mejor encajen con el tono que pide. Evita 'partial' si hay otros. Ante igualdad, prefiere 'pending' (el usuario ya quería verlos).",
  ].join(" ");
  const user = [
    message
      ? `Petición del usuario: "${message}".`
      : "Sin petición concreta: elige una selección variada y actual.",
    intent?.hasIntent ? `Criterios: ${describeIntent(intent)}.` : "",
    `candidates: ${JSON.stringify(slim)}`,
  ].filter(Boolean).join(" ");
  return { system, user };
}

async function getOllamaRecommendation({ message, candidates, intent }) {
  // Se muestran al modelo solo los N mejores candidatos (menos prefill = más
  // rápido en CPU). La selección se valida luego contra TODA la lista.
  const aiCandidates = candidates.slice(0, OLLAMA_MAX_CANDIDATES);
  if (aiCandidates.length < 4) return null;

  // Salida mínima: solo las keys elegidas, con `enum` para que el modelo pequeño
  // no pueda inventar claves. Menos tokens de salida = mucho menos tiempo en CPU.
  const format = {
    type: "object",
    properties: {
      keys: {
        type: "array",
        minItems: 4,
        maxItems: 6,
        items: { type: "string", enum: aiCandidates.map((c) => itemKey(c)) },
      },
    },
    required: ["keys"],
  };

  const { system, user } = buildOllamaMessages({ message, candidates: aiCandidates, intent });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        format,
        // Mantener el modelo cargado (respeta el OLLAMA_KEEP_ALIVE del contenedor):
        // así solo la primera petición paga la carga; las siguientes van ~13-16s.
        keep_alive: "24h",
        options: { temperature: 0.4, num_predict: 120 },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (err) {
    console.warn("[watch-next] Ollama fallback:", {
      error: err?.name === "AbortError" ? "timeout" : "network_error",
    });
    return null;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    console.warn("[watch-next] Ollama fallback:", { status: res.status });
    return null;
  }

  const json = await safeJson(res);
  const parsed = parseJsonLoose(json?.message?.content);
  const keys = safeArray(parsed?.keys)
    .map((k) => String(k || "").trim())
    .filter(Boolean);
  if (!keys.length) return null;

  // La IA solo elige keys; reply, motivo y etiquetas se generan localmente aguas
  // abajo (buildSelectionReply / serializeRecommendation) con mayor calidad.
  const uniqueKeys = [...new Set(keys)];
  const normalized = normalizeAiSelection({
    parsed: { recommendations: uniqueKeys.map((key) => ({ key })) },
    candidates,
    message,
  });
  if (!normalized) return null;

  return {
    recommendations: normalized.recommendations,
    provider: "ollama",
  };
}

async function getAiRecommendation({ message, candidates, contextSummary, intent }) {
  const providers = String(WATCH_NEXT_AI_PROVIDER)
    .split(",")
    .map((provider) => provider.trim().toLowerCase())
    .filter(
      (provider) =>
        provider === "openai" ||
        provider === "gemini" ||
        provider === "ollama",
    );

  const orderedProviders = providers.length
    ? providers
    : [GEMINI_API_KEY ? "gemini" : OPENAI_API_KEY ? "openai" : "ollama"];
  for (const provider of orderedProviders) {
    let result = null;
    try {
      result =
        provider === "openai"
          ? await getOpenAiRecommendation({
              message,
              candidates,
              contextSummary,
              intent,
            })
          : provider === "gemini"
            ? await getGeminiRecommendation({
                message,
                candidates,
                contextSummary,
                intent,
              })
            : provider === "ollama"
              ? await getOllamaRecommendation({
                  message,
                  candidates,
                  contextSummary,
                  intent,
                })
              : null;
    } catch (error) {
      console.warn("[watch-next] AI provider exception:", {
        provider,
        code: error?.name || "error",
        message: String(error?.message || "unknown").slice(0, 140),
      });
    }

    if (result?.recommendations?.length) return result;
  }

  return null;
}

// Cuántas fichas se piden como mucho para comprobar duración o plataforma de
// candidatos que no salieron de una búsqueda que ya lo garantice.
const MAX_FACT_LOOKUPS = 36;

const EMPTY_NOVELTY = { nowPlaying: [], upcoming: [], onTheAir: [], airingToday: [], weeklyTrending: [] };

export async function POST(request) {
  const cookieStore = await cookies();
  const body = await request.json().catch(() => ({}));
  const mode = body?.mode === "quick_pick" ? "quick_pick" : "chat";
  const quickPick = mode === "quick_pick";
  const message = String(
    body?.message || (quickPick ? "Recomiéndame 3 cosas para ver ahora" : ""),
  )
    .trim()
    .slice(0, 800);
  const today = new Date();
  const intent = parseWatchIntent(message, { now: today });
  // «Dame dos pelis…»: el número del mensaje manda sobre el de la petición.
  const limit = clampRecommendationLimit(
    !quickPick && intent.count ? intent.count : body?.limit,
    quickPick ? 3 : 5,
  );
  const recentKeys = normalizeRecentKeys(body?.recentKeys);
  const recentKeySet = new Set(recentKeys);

  // Sin criterios (o con estrenos / cines) cuentan las fuentes de novedad y
  // tendencia. Con criterios concretos casi nunca cumplen: no se piden.
  const wantsNovelty = !intent.hasConstraints || intent.years?.recent || intent.inCinemas;

  const [
    library,
    tmdbContext,
    traktContext,
    baseRecommended,
    trending,
    anticipated,
    popular,
    tmdbNovelty,
    tmdbFallback,
    discoverResults,
    nowPlayingCinema,
  ] = await Promise.all([
    getBackendLibrary(request).catch(() => ({ connected: false, watchlist: [], favorites: [], rated: [], historyKeys: new Set() })),
    getTmdbContext(cookieStore),
    getTraktContext(cookieStore),
    getTraktRecommended(30).catch(() => []),
    wantsNovelty ? getTraktTrending(24).catch(() => []) : [],
    wantsNovelty && !intent.inCinemas ? getTraktAnticipated(24).catch(() => []) : [],
    wantsNovelty ? getTraktPopular(24).catch(() => []) : [],
    wantsNovelty ? getTmdbNoveltyCandidates(36).catch(() => EMPTY_NOVELTY) : EMPTY_NOVELTY,
    intent.hasConstraints ? [] : getTmdbFallbackCandidates(30).catch(() => []),
    runDiscoverQueries(intent, today).catch(() => []),
    intent.inCinemas
      ? Promise.all([
          tmdbList("/movie/now_playing", { page: 1, region: "ES" }).catch(() => []),
          tmdbList("/movie/now_playing", { page: 2, region: "ES" }).catch(() => []),
        ]).then((pages) => pages.flat())
      : [],
  ]);

  // Pendientes, favoritos y notas: los de la app (backend); si no hay sesión
  // del backend, los de TMDb.
  const watchlist = library.connected ? library.watchlist : tmdbContext.watchlist;
  const favorites = library.connected ? library.favorites : tmdbContext.favorites;
  const rated = library.connected ? library.rated : tmdbContext.rated;
  const similar = await getSimilarCandidates(intent, favorites).catch(() => ({ seeds: [], lists: [] }));
  const seedTitle = similar.seeds.find((seed) => seed.source === "similar")?.title || null;
  const seedKeys = new Set(similar.seeds.map((seed) => `${seed.mediaType}:${Number(seed.id)}`));

  const watchedSet = new Set([
    ...library.historyKeys,
    ...safeArray(traktContext.history).map((item) => itemKey(item)),
  ]);
  const profileGenres = inferFavoriteGenres({
    favorites,
    rated,
    traktRatings: traktContext.ratings,
  });

  const candidateMap = new Map();
  addCandidates(candidateMap, watchlist, "watchlist");
  if (!intent.onlyWatchlist) {
    addCandidates(candidateMap, safeArray(tmdbNovelty.nowPlaying), "tmdb_now_playing", 0, { mediaType: "movie", verified: ["cinema"] });
    addCandidates(candidateMap, nowPlayingCinema, "tmdb_now_playing", 0, { mediaType: "movie", verified: ["cinema"] });
    addCandidates(candidateMap, safeArray(tmdbNovelty.upcoming), "tmdb_upcoming", 0, { mediaType: "movie" });
    addCandidates(candidateMap, safeArray(tmdbNovelty.onTheAir), "tmdb_on_the_air", 0, { mediaType: "tv" });
    addCandidates(candidateMap, safeArray(tmdbNovelty.airingToday), "tmdb_airing_today", 0, { mediaType: "tv" });
    addCandidates(candidateMap, safeArray(tmdbNovelty.weeklyTrending), "tmdb_weekly_trending");
    addCandidates(candidateMap, baseRecommended, "trakt_recommended");
    addCandidates(candidateMap, trending, "trakt_trending");
    addCandidates(candidateMap, anticipated, "trakt_anticipated");
    addCandidates(candidateMap, popular, "trakt_popular");
    addCandidates(candidateMap, tmdbFallback, "tmdb_fallback");
    for (const { query, items } of safeArray(discoverResults)) {
      addCandidates(candidateMap, items, query.verifies.includes("cinema") ? "tmdb_now_playing" : "tmdb_discovery", 0, {
        mediaType: query.mediaType,
        verified: query.verifies,
        genreMatch: query.genreMatch,
      });
    }
    for (const { seed, items } of similar.lists) {
      addCandidates(candidateMap, items, seed.source, 0, { mediaType: seed.mediaType });
    }
  }
  // El título de referencia («parecida a Dark») no se recomienda a sí mismo.
  for (const key of seedKeys) candidateMap.delete(key);
  // Con similares de sobra, «parecida a…» solo admite similares (se relaja si
  // con los demás criterios no llegan).
  const similarCount = [...candidateMap.values()].filter((item) =>
    item.sources.some((source) => source === "similar" || source === "similar_favorites"),
  ).length;
  if (similar.seeds.length && similarCount >= limit + 2) intent.requireSimilar = true;

  // Duración, plataforma o país no vienen en los listados: para los
  // candidatos que no salieron de una búsqueda que lo garantice (Pendientes,
  // similares, tendencias…) se pide su ficha. Primero los que más prometen.
  const needsFacts = (item) => {
    const verified = new Set(item.verified || []);
    const range = runtimeRange(intent, item.mediaType);
    return (
      ((range.min != null || range.max != null) && !verified.has("runtime")) ||
      ((intent.providers.length || intent.free) && !verified.has("providers")) ||
      (intent.origin && !verified.has("origin") && !item.originalLanguage)
    );
  };
  const preliminary = [...candidateMap.values()]
    .filter((item) => needsFacts(item))
    .filter((item) => checkCandidate(item, intent, { today, level: 2 }).missing.every((m) => ["runtime", "providers", "origin"].includes(m)))
    .map((item) => ({
      item,
      priority:
        (item.sources.includes("watchlist") ? 1000 : 0) +
        (item.sources.some((s) => s.startsWith("similar")) ? 500 : 0) +
        scoreCandidate(item, intent, { profileGenres, watchedSet, recentKeySet, quickPick, today }),
    }))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, MAX_FACT_LOOKUPS)
    .map(({ item }) => item);
  const facts = await mapLimit(preliminary, 8, (item) => getTitleFacts(item));
  preliminary.forEach((item, index) => {
    const f = facts[index];
    if (!f) return;
    item.runtime = f.runtime;
    item.episodeRuntime = f.episodeRuntime;
    item.providerIds = f.providerIds;
    item.originalLanguage = f.originalLanguage || item.originalLanguage;
    if (f.originCountry.length) item.originCountry = f.originCountry;
    if (f.genreIds.length) item.genreIds = [...new Set([...item.genreIds, ...f.genreIds])];
    item.voteCount = item.voteCount ?? f.voteCount;
    item.voteAverage = item.voteAverage ?? f.voteAverage;
    item.releaseDate = item.releaseDate || f.releaseDate;
  });

  // FILTRO por niveles: primero lo que lo cumple todo; si no llega, lo que
  // cumple lo importante (tipo, excluidos, plataforma, cines, pendientes) con
  // menos exigencia en nota, época, duración y, al final, género.
  const scoreCtx = { profileGenres, watchedSet, recentKeySet, quickPick, today };
  const all = [...candidateMap.values()];
  const byLevel = [0, 1, 2].map((level) =>
    all.filter((item) => checkCandidate(item, intent, { today, level }).ok),
  );
  const ranked = [];
  const taken = new Set();
  const usedLevels = [];
  for (let level = 0; level < 3; level++) {
    const fresh = byLevel[level].filter((item) => !taken.has(itemKey(item)));
    if (!fresh.length) continue;
    // Con lo estricto ya hay de sobra para elegir y variar: no se relaja.
    if (level > 0 && ranked.length >= limit + 3) break;
    if (level > 0) usedLevels.push(level);
    for (const item of fresh) {
      taken.add(itemKey(item));
      ranked.push({ ...item, relaxedLevel: level, score: scoreCandidate(item, intent, scoreCtx) });
    }
  }
  ranked.sort((a, b) => a.relaxedLevel - b.relaxedLevel || b.score - a.score);
  // Lo visto se queda fuera (salvo «rever»), igual que lo recomendado hace
  // nada si hay alternativas.
  const pool = ranked.filter((item) => intent.rewatch || !watchedSet.has(itemKey(item)) || item.sources.includes("watchlist"));

  const contextSummary = {
    backendConnected: library.connected,
    tmdbConnected: tmdbContext.connected,
    traktConnected: traktContext.connected,
    historyCount: library.historyKeys.size || traktContext.history.length,
    favoritesCount: favorites.length,
    watchlistCount: watchlist.length,
    ratedCount: rated.length + traktContext.ratings.length,
    aiEnabled: !!(GEMINI_API_KEY || OPENAI_API_KEY || OLLAMA_ENABLED),
    aiProviders: {
      gemini: !!GEMINI_API_KEY,
      openai: !!OPENAI_API_KEY,
      ollama: OLLAMA_ENABLED,
    },
    quickPick,
    recentKeysCount: recentKeys.length,
    intent: intent.hasIntent ? describeIntent(intent) : null,
    candidatesStrict: byLevel[0].length,
    candidatesTotal: pool.length,
  };

  // La IA elige entre los candidatos ya filtrados (los estrictos primero): no
  // puede saltarse los criterios.
  const strictCount = pool.filter((item) => item.relaxedLevel === 0).length;
  const aiCandidates = strictCount >= limit + 2 ? pool.filter((item) => item.relaxedLevel === 0) : pool;
  const ai = aiCandidates.length >= 4
    ? await getAiRecommendation({
        message,
        candidates: aiCandidates,
        contextSummary,
        intent,
      }).catch(() => null)
    : null;

  const aiRanked = ai?.recommendations?.length
    ? [
        // Lo que eligió la IA, delante (manteniendo su nivel de encaje).
        ...ai.recommendations.map((rec, index) => ({ ...rec, score: (rec.score || 0) + 200 - index * 5 })),
        ...pool.filter(
          (item) => !ai.recommendations.some((recommended) => itemKey(recommended) === itemKey(item)),
        ),
      ]
    : pool;
  const selected = diversifyRecommendations({
    candidates: aiRanked,
    limit,
    intent,
    recentKeySet,
    quickPick,
  });

  const relaxed = new Set();
  for (const item of selected) {
    if (!item.relaxedLevel) continue;
    for (const missing of checkCandidate(item, intent, { today, level: 0 }).missing) {
      if (Object.values(RELAXED_AT_LEVEL).flat().includes(missing)) relaxed.add(missing);
    }
  }
  const watchlistHits = selected.filter((item) => item.sources.includes("watchlist")).length;

  let emptyReason = null;
  if (!selected.length) {
    emptyReason = intent.onlyWatchlist
      ? watchlist.length
        ? "No he encontrado en tus Pendientes nada que encaje con eso. Prueba a quitar algún criterio o pídemelo fuera de tus pendientes."
        : "No tienes títulos en Pendientes todavía, así que no puedo elegir entre ellos."
      : `No he encontrado títulos que encajen con ${describeIntent(intent)}. Prueba a quitar algún criterio.`;
  }

  const payload = {
    reply: buildSelectionReply({
      intent,
      selected,
      contextSummary,
      quickPick,
      relaxed: [...relaxed],
      watchlistHits,
      seedTitle,
      emptyReason,
    }),
    recommendations: selected.map((item) =>
      serializeRecommendation(item, { ...intent, similar: intent.similar ? { ...intent.similar, seedTitle } : null }),
    ),
    contextSummary,
    mode: ai ? "ai" : "ranking",
    requestMode: mode,
    provider: ai?.provider || "ranking",
    engine: ai?.provider || "rules",
    diversityApplied: true,
  };

  const res = NextResponse.json(payload);
  if (traktContext.refreshedTokens) {
    setTraktCookies(res, traktContext.refreshedTokens);
  }
  if (traktContext.shouldClear) {
    clearTraktCookies(res);
  }
  if (library.authResult) {
    setBackendAuthCookies(res, library.authResult, { secure: request.nextUrl?.protocol === "https:" });
  }
  return res;
}
