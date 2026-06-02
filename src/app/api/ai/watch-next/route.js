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
// Ollama — LLM local gratuito (por defecto: qwen2.5:3b)
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || "").replace(/\/$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:3b";
const WATCH_NEXT_AI_PROVIDER =
  process.env.WATCH_NEXT_AI_PROVIDER ||
  (OLLAMA_BASE_URL ? "ollama" : GEMINI_API_KEY ? "gemini" : "openai");

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
        maxItems: 6,
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

const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    reply: { type: "STRING" },
    recommendations: {
      type: "ARRAY",
      minItems: 3,
      maxItems: 6,
      items: {
        type: "OBJECT",
        properties: {
          key: { type: "STRING" },
          reason: { type: "STRING" },
          matchTags: {
            type: "ARRAY",
            minItems: 1,
            maxItems: 4,
            items: { type: "STRING" },
          },
        },
        required: ["key", "reason", "matchTags"],
      },
    },
  },
  required: ["reply", "recommendations"],
};

const OLLAMA_GENRE_MAP = {
  action:       [28, 10759],
  comedy:       [35],
  drama:        [18],
  thriller:     [53],
  horror:       [27],
  romance:      [10749],
  "sci-fi":     [878, 10765],
  animation:    [16],
  crime:        [80],
  documentary:  [99],
  fantasy:      [14, 10765],
  mystery:      [9648],
  adventure:    [12],
};

const GENRE_HINTS = [
  { id: 28, words: ["acción", "accion", "peleas", "explosiones"] },
  { id: 12, words: ["aventura", "épica", "epica"] },
  { id: 16, words: ["animación", "animacion", "anime"] },
  { id: 35, words: ["comedia", "risa", "divertida", "ligera", "ligero"] },
  { id: 80, words: ["crimen", "mafia", "policíaca", "policiaca"] },
  { id: 18, words: ["drama", "emocional", "intensa", "intenso"] },
  { id: 27, words: ["terror", "miedo", "susto"] },
  { id: 9648, words: ["misterio", "intriga"] },
  { id: 10749, words: ["romance", "amor", "romántica", "romantica"] },
  { id: 878, words: ["ciencia ficción", "ciencia ficcion", "sci-fi", "scifi"] },
  { id: 53, words: ["thriller", "tensión", "tension", "suspense"] },
  { id: 10759, words: ["acción", "accion", "aventura"] },
  { id: 10765, words: ["fantasía", "fantasia", "sci-fi", "sobrenatural"] },
];

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
  const title = mediaType === "movie" ? item?.title : item?.name || item?.title;
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
    popularity: typeof item?.popularity === "number" ? item.popularity : 0,
    genreIds: safeArray(item?.genre_ids).map(Number).filter(Number.isFinite),
    userRating:
      typeof item?.user_rating === "number" ? Number(item.user_rating) : null,
    sources: [source],
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

function addCandidates(map, items, source, baseScore = 0) {
  for (const raw of safeArray(items)) {
    const item = normalizeItem(raw, source);
    if (!item) continue;
    const key = itemKey(item);
    const prev = map.get(key);
    if (prev) {
      prev.sources = Array.from(new Set([...prev.sources, source]));
      prev.score += baseScore;
      prev.voteAverage = prev.voteAverage ?? item.voteAverage;
      prev.popularity = Math.max(prev.popularity || 0, item.popularity || 0);
      prev.genreIds = Array.from(new Set([...prev.genreIds, ...item.genreIds]));
      if (!prev.posterPath && item.posterPath) prev.posterPath = item.posterPath;
      if (!prev.backdropPath && item.backdropPath) prev.backdropPath = item.backdropPath;
      if (!prev.overview && item.overview) prev.overview = item.overview;
    } else {
      item.score = baseScore;
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

async function getTmdbQualityCandidates(limit = 30) {
  const [movies, shows] = await Promise.all([
    tmdbList("/movie/top_rated", { page: 1, region: "ES" }).catch(() => []),
    tmdbList("/tv/top_rated", { page: 1 }).catch(() => []),
  ]);

  return [...movies, ...shows]
    .filter((item) => item?.media_type !== "person")
    .slice(0, limit);
}

async function getTmdbDiscoveryCandidates(message, limit = 32) {
  const wantedGenres = getWantedGenreIds(message);
  const wantedType = getWantedMediaType(message);
  const genreParam = wantedGenres.length ? wantedGenres.slice(0, 4).join("|") : null;
  const commonParams = {
    page: 1,
    sort_by: "popularity.desc",
    "vote_count.gte": 80,
    "vote_average.gte": 6,
  };
  const movieParams = genreParam
    ? { ...commonParams, with_genres: genreParam, region: "ES" }
    : { ...commonParams, region: "ES" };
  const tvParams = genreParam
    ? { ...commonParams, with_genres: genreParam }
    : commonParams;

  const [movies, shows] = await Promise.all([
    wantedType === "tv"
      ? Promise.resolve([])
      : tmdbList("/discover/movie", movieParams).catch(() => []),
    wantedType === "movie"
      ? Promise.resolve([])
      : tmdbList("/discover/tv", tvParams).catch(() => []),
  ]);

  return [...movies, ...shows]
    .filter((item) => item?.media_type !== "person")
    .slice(0, limit);
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

function getWantedMediaType(message) {
  const text = String(message || "").toLowerCase();
  if (/\b(pel[ií]cula|peli|film|cine)\b/.test(text)) return "movie";
  if (/\b(serie|series|cap[ií]tulos?|temporada)\b/.test(text)) return "tv";
  return null;
}

function getWantedGenreIds(message) {
  const text = String(message || "").toLowerCase();
  const ids = new Set();
  for (const hint of GENRE_HINTS) {
    if (hint.words.some((word) => text.includes(word))) ids.add(hint.id);
  }
  return Array.from(ids);
}

function wantsFutureReleases(message) {
  return /\b(pr[oó]xim[oa]s?|futur[oa]s?|cuando salga|estrenos? futuros?|esperad[oa]s?)\b/i.test(
    String(message || ""),
  );
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

function scoreCandidates({ candidates, message, profileGenres, watchedSet }) {
  const wantedType = getWantedMediaType(message);
  const wantedGenres = getWantedGenreIds(message);
  const text = String(message || "").toLowerCase();
  const wantsShort = /corta|corto|rápida|rapida|poco tiempo|algo breve/.test(text);
  const wantsQuality = /buena|mejor|obra maestra|top|calidad|notaza/.test(text);

  return candidates
    .map((item) => {
      let score = item.score || 0;
      const key = itemKey(item);
      const genreIds = new Set(item.genreIds || []);

      const daysFromRelease = item.releaseDate
        ? Math.round(
            (new Date(`${item.releaseDate}T00:00:00Z`).getTime() - Date.now()) /
              86400000,
          )
        : null;
      const isRecentRelease =
        Number.isFinite(daysFromRelease) &&
        daysFromRelease <= 45 &&
        daysFromRelease >= -180;
      const isNearRelease =
        Number.isFinite(daysFromRelease) &&
        daysFromRelease > 45 &&
        daysFromRelease <= 120;

      if (item.sources.includes("watchlist")) score += 20;
      if (item.sources.includes("trakt_recommended")) score += 28;
      if (item.sources.includes("trakt_trending")) score += 18;
      if (item.sources.includes("trakt_anticipated")) score += 18;
      if (item.sources.includes("trakt_popular")) score += 8;
      if (item.sources.includes("tmdb_now_playing")) score += 24;
      if (item.sources.includes("tmdb_upcoming")) score += 18;
      if (item.sources.includes("tmdb_on_the_air")) score += 22;
      if (item.sources.includes("tmdb_airing_today")) score += 18;
      if (item.sources.includes("tmdb_weekly_trending")) score += 20;
      if (item.sources.includes("tmdb_fallback")) score += 5;
      if (isRecentRelease) score += item.mediaType === "movie" ? 18 : 12;
      if (isNearRelease) score += 8;
      if (item.voteAverage) score += item.voteAverage * (wantsQuality ? 3 : 1.7);
      if (item.popularity) score += Math.min(16, Math.log10(item.popularity + 1) * 7);
      if (wantedType && item.mediaType === wantedType) score += 22;
      if (wantedType && item.mediaType !== wantedType) score -= 18;

      for (const id of wantedGenres) {
        if (genreIds.has(id)) score += 18;
      }
      for (const id of profileGenres) {
        if (genreIds.has(id)) score += 5;
      }
      if (wantsShort && item.mediaType === "movie") score += 10;
      if (watchedSet.has(key) && !item.sources.includes("watchlist")) score -= 90;

      return { ...item, score };
    })
    .sort((a, b) => b.score - a.score);
}

function buildReason(item, message, source = "ranking") {
  const bits = [];
  if (item.sources.includes("tmdb_now_playing")) {
    bits.push("es una novedad reciente de cine");
  }
  if (item.sources.includes("tmdb_on_the_air") || item.sources.includes("tmdb_airing_today")) {
    bits.push("está entre las series activas ahora mismo");
  }
  if (item.sources.includes("tmdb_weekly_trending") || item.sources.includes("trakt_trending")) {
    bits.push("está funcionando muy bien en tendencia");
  }
  if (item.sources.includes("tmdb_upcoming") || item.sources.includes("trakt_anticipated")) {
    bits.push("aparece entre los próximos estrenos más relevantes");
  }
  if (item.sources.includes("trakt_recommended")) {
    bits.push("también aparece entre recomendaciones de Trakt");
  }
  if (item.sources.includes("watchlist")) {
    bits.push("además ya la tienes pendiente");
  }
  if (item.voteAverage && item.voteAverage >= 7.5) {
    bits.push(`tiene una valoración sólida (${item.voteAverage.toFixed(1)})`);
  }
  if (getWantedMediaType(message) === item.mediaType) {
    bits.push(`encaja con que te apetece ${item.mediaType === "movie" ? "una película" : "una serie"}`);
  }
  if (!bits.length) bits.push("equilibra afinidad con tu perfil y popularidad actual");

  return `${bits.slice(0, 2).join(" y ")}.`;
}

function serializeRecommendation(item, message, source = "ranking") {
  const sourceTags = item.sources.map((s) => {
    if (s === "watchlist") return "Pendiente";
    if (s === "trakt_recommended") return "Trakt";
    if (s === "trakt_trending") return "Tendencia";
    if (s === "trakt_anticipated") return "Esperada";
    if (s === "trakt_popular") return "Popular";
    if (s === "tmdb_now_playing") return "Novedad";
    if (s === "tmdb_upcoming") return "Estreno";
    if (s === "tmdb_on_the_air") return "En emisión";
    if (s === "tmdb_airing_today") return "Hoy";
    if (s === "tmdb_weekly_trending") return "Tendencia";
    if (s === "tmdb_fallback") return "TMDb";
    return s;
  });

  return {
    id: item.id,
    mediaType: item.mediaType,
    title: item.title,
    year: item.year,
    posterPath: item.posterPath,
    backdropPath: item.backdropPath,
    voteAverage: item.voteAverage,
    href: `/details/${item.mediaType}/${item.id}`,
    reason: item.reason || buildReason(item, message, source),
    matchTags: item.matchTags || Array.from(new Set(sourceTags)).slice(0, 3),
  };
}

function buildFallbackReply({ message, ranked, contextSummary }) {
  const hasPersonal =
    contextSummary.watchlistCount ||
    contextSummary.favoritesCount ||
    contextSummary.historyCount ||
    contextSummary.ratedCount;
  const intro = hasPersonal
    ? "He cruzado lo que te apetece con novedades, tendencias y tu perfil, sin limitarme a tus pendientes."
    : "No tengo mucho contexto personal todavía, así que he priorizado novedades, tendencias y opciones fuertes.";
  const mood = String(message || "").trim()
    ? ` Para "${String(message).trim()}", empezaría por estas opciones.`
    : " Estas son buenas candidatas para decidir rápido.";
  return `${intro}${mood}`;
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

function isNoveltyCandidate(item) {
  return safeArray(item?.sources).some((source) =>
    [
      "tmdb_now_playing",
      "tmdb_upcoming",
      "tmdb_on_the_air",
      "tmdb_airing_today",
      "tmdb_weekly_trending",
      "trakt_trending",
      "trakt_anticipated",
    ].includes(source),
  );
}

function selectCandidatesForAi(candidates) {
  const selected = new Map();
  const add = (items, limit) => {
    for (const item of safeArray(items)) {
      if (selected.size >= limit) break;
      selected.set(itemKey(item), item);
    }
  };

  add(candidates.slice(0, 18), 36);
  add(candidates.filter(isNoveltyCandidate).slice(0, 18), 36);
  add(candidates.filter((item) => item.sources.includes("watchlist")).slice(0, 6), 36);
  add(candidates, 36);

  return [...selected.values()];
}

function compactCandidatesForAi(candidates) {
  return selectCandidatesForAi(candidates).map((item) => ({
    key: itemKey(item),
    id: item.id,
    mediaType: item.mediaType,
    title: item.title,
    year: item.year,
    voteAverage: item.voteAverage,
    releaseDate: item.releaseDate,
    sources: item.sources,
    overview: item.overview ? item.overview.slice(0, 280) : "",
    score: Math.round(item.score),
  }));
}

function buildAiSystemPrompt() {
  return [
    "Eres un recomendador experto de cine y series para The Show Verse. Tu misión es seleccionar exactamente entre 4 y 6 títulos de la lista de candidatos.",
    "REGLAS ESTRICTAS:",
    "1. Elige ÚNICAMENTE títulos que aparezcan en la lista 'candidates' con su campo 'key' exacto.",
    "2. NO inventes títulos ni uses IDs de tu memoria. Solo los candidatos provistos.",
    "3. Prioriza novedades recientes, estrenos, series en emisión y tendencias cuando el usuario lo pide.",
    "4. Usa el historial, favoritos, valoraciones y watchlist ÚNICAMENTE como señales de afinidad personal.",
    "5. Selecciona variedad: mezcla películas y series salvo que el usuario pida explícitamente un tipo.",
    "6. El campo 'reason' debe ser específico, máximo 2 frases, explicando POR QUÉ ese título encaja con lo que pide el usuario.",
    "7. 'matchTags' deben ser 2-3 etiquetas cortas en español (ej: 'Tendencia', 'Sci-Fi', 'Valoración alta', 'En emisión', 'Tu perfil').",
    "8. El campo 'reply' es una frase de 1-2 oraciones en español explicando el criterio general de selección.",
    "FORMATO DE RESPUESTA (JSON estricto):",
    '{"reply":"string","recommendations":[{"key":"movie:123","reason":"string","matchTags":["string"]}]}',
    "Todo debe estar en español.",
  ].join(" ");
}

function buildOllamaIntentPrompt() {
  return (
    "Extract viewing intent from user message. Reply ONLY with compact JSON, nothing else.\n" +
    'Schema: {"t":"movie"|"show"|"any","g":["comedy",...],"y":"1990s"|"2000s"|"2010s"|"2020s"|"recent"|"classic"}\n' +
    "Genres (use only these): action,comedy,drama,thriller,horror,romance,sci-fi,animation,crime,documentary,fantasy,mystery,adventure\n" +
    "Omit fields that are not specified. Reply with {} if no intent is clear."
  );
}

function buildAiUserPayload({ message, candidates, contextSummary }) {
  const compactCandidates = compactCandidatesForAi(candidates);
  const userContext = [
    contextSummary.traktConnected || contextSummary.tmdbConnected
      ? `El usuario tiene ${contextSummary.historyCount} títulos en historial, ${contextSummary.favoritesCount} favoritos, ${contextSummary.watchlistCount} pendientes y ${contextSummary.ratedCount} valorados.`
      : "No hay datos personales del usuario disponibles.",
    message
      ? `PETICIÓN DEL USUARIO: "${message}". Prioriza candidatos que cumplan esta petición.`
      : "El usuario no especificó preferencias concretas.",
    `Hay ${compactCandidates.length} candidatos disponibles. Selecciona entre 4 y 6.`,
  ].join(" ");

  return JSON.stringify({
    userRequest: message,
    context: userContext,
    contextSummary,
    candidates: compactCandidates,
  });
}

function normalizeAiSelection({ parsed, candidates, message }) {
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
      return {
        ...item,
        reason: String(rec.reason || "").trim() || buildReason(item, message, "ai"),
        matchTags: safeArray(rec.matchTags).slice(0, 4),
      };
    })
    .filter(Boolean)
    .slice(0, 6);

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

async function getOpenAiRecommendation({ message, candidates, contextSummary }) {
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
          content: buildAiUserPayload({ message, candidates, contextSummary }),
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
    reply:
      normalized.reply ||
      buildFallbackReply({
        message,
        ranked: normalized.recommendations,
        contextSummary,
      }),
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

async function getGeminiRecommendation({ message, candidates, contextSummary }) {
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
    reply:
      normalized.reply ||
      buildFallbackReply({
        message,
        ranked: normalized.recommendations,
        contextSummary,
      }),
    recommendations: normalized.recommendations,
    provider: "gemini",
  };
}

// ─── Ollama ───────────────────────────────────────────────────────────────────
// Uses intent extraction instead of candidate selection to keep output ≤ 80 tokens
// (~5-10 s at 3.5 tok/s). The server's ranking algorithm then applies the intent.
async function getOllamaRecommendation({ message, candidates }) {
  if (!OLLAMA_BASE_URL) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  let res;
  try {
    res = await fetch(`${OLLAMA_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: "system", content: buildOllamaIntentPrompt() },
          { role: "user", content: message || "Recomiéndame algo interesante" },
        ],
        temperature: 0.1,
        max_tokens: 80,
        stream: false,
        options: { num_thread: 4 },
      }),
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  const json = await safeJson(res);
  if (!res.ok) {
    console.warn("[watch-next] Ollama error:", { status: res.status, error: json?.error || "unknown" });
    return null;
  }

  const rawContent = json?.choices?.[0]?.message?.content;
  const intent = parseJsonLoose(rawContent);

  if (!intent) {
    console.warn("[watch-next] Ollama intent parse failed:", { raw: String(rawContent || "").slice(0, 100) });
    return null;
  }

  // Map intent fields to score boosts and apply to candidates
  const intentType = intent.t === "movie" ? "movie" : intent.t === "show" ? "tv" : null;
  const intentGenreIds = new Set();
  for (const g of safeArray(intent.g)) {
    for (const id of (OLLAMA_GENRE_MAP[String(g).toLowerCase()] || [])) intentGenreIds.add(id);
  }

  let yearMin = null, yearMax = null;
  if (intent.y === "recent" || intent.y === "2020s")      { yearMin = 2020; }
  else if (intent.y === "2010s") { yearMin = 2010; yearMax = 2019; }
  else if (intent.y === "2000s") { yearMin = 2000; yearMax = 2009; }
  else if (intent.y === "1990s") { yearMin = 1990; yearMax = 1999; }
  else if (intent.y === "1980s") { yearMin = 1980; yearMax = 1989; }
  else if (intent.y === "classic")                        { yearMax = 2000; }

  const hasIntent = intentType || intentGenreIds.size > 0 || yearMin || yearMax;
  if (!hasIntent) return null;

  const rescored = candidates.map((item) => {
    let boost = 0;
    if (intentType) {
      boost += item.mediaType === intentType ? 30 : -40;
    }
    for (const id of intentGenreIds) {
      if (safeArray(item.genreIds).includes(id)) boost += 20;
    }
    const itemYear = parseInt(item.year, 10);
    if (!isNaN(itemYear)) {
      if (yearMin && itemYear < yearMin) boost -= 25;
      if (yearMax && itemYear > yearMax) boost -= 25;
      if (yearMin && yearMax && itemYear >= yearMin && itemYear <= yearMax) boost += 15;
    }
    return { ...item, score: (item.score || 0) + boost };
  }).sort((a, b) => b.score - a.score);

  const top = rescored.slice(0, 5);
  if (!top.length) return null;

  const typeLabel = intentType === "movie" ? "películas" : intentType === "tv" ? "series" : "títulos";
  const genreLabel = safeArray(intent.g).slice(0, 2).join(" y ");
  const parts = [];
  if (genreLabel) parts.push(`de ${genreLabel}`);
  if (intent.y === "recent")  parts.push("recientes");
  else if (intent.y === "classic") parts.push("clásicos");
  else if (intent.y)          parts.push(`de los ${intent.y}`);

  const reply = parts.length
    ? `He seleccionado ${typeLabel} ${parts.join(", ")} que encajan con tu petición.`
    : `He seleccionado los ${typeLabel} que mejor encajan con lo que buscas.`;

  return { reply, recommendations: top, provider: "ollama", model: OLLAMA_MODEL };
}

async function getAiRecommendation({ message, candidates, contextSummary }) {
  const providers = String(WATCH_NEXT_AI_PROVIDER)
    .split(",")
    .map((provider) => provider.trim().toLowerCase())
    .filter(Boolean);

  const orderedProviders = providers.length ? providers : ["ollama", "gemini", "openai"];
  for (const provider of orderedProviders) {
    let result = null;
    try {
      result =
        provider === "ollama"
          ? await getOllamaRecommendation({
              message,
              candidates,
              contextSummary,
            })
          : provider === "openai"
            ? await getOpenAiRecommendation({
                message,
                candidates,
                contextSummary,
              })
            : provider === "gemini"
              ? await getGeminiRecommendation({
                  message,
                  candidates,
                  contextSummary,
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

export async function POST(request) {
  const cookieStore = await cookies();
  const body = await request.json().catch(() => ({}));
  const message = String(body?.message || "").trim().slice(0, 800);

  const [
    tmdbContext,
    traktContext,
    baseRecommended,
    trending,
    anticipated,
    popular,
    tmdbNovelty,
    tmdbFallback,
  ] =
    await Promise.all([
      getTmdbContext(cookieStore),
      getTraktContext(cookieStore),
      getTraktRecommended(30).catch(() => []),
      getTraktTrending(24).catch(() => []),
      getTraktAnticipated(24).catch(() => []),
      getTraktPopular(24).catch(() => []),
      getTmdbNoveltyCandidates(36).catch(() => ({
        nowPlaying: [],
        upcoming: [],
        onTheAir: [],
        airingToday: [],
        weeklyTrending: [],
      })),
      getTmdbFallbackCandidates(30).catch(() => []),
    ]);

  const watchedSet = new Set(
    safeArray(traktContext.history).map((item) => itemKey(item)),
  );
  const profileGenres = inferFavoriteGenres({
    favorites: tmdbContext.favorites,
    rated: tmdbContext.rated,
    traktRatings: traktContext.ratings,
  });

  const candidateMap = new Map();
  addCandidates(candidateMap, safeArray(tmdbNovelty.nowPlaying), "tmdb_now_playing", 24);
  addCandidates(candidateMap, safeArray(tmdbNovelty.upcoming), "tmdb_upcoming", 18);
  addCandidates(candidateMap, safeArray(tmdbNovelty.onTheAir), "tmdb_on_the_air", 22);
  addCandidates(candidateMap, safeArray(tmdbNovelty.airingToday), "tmdb_airing_today", 18);
  addCandidates(
    candidateMap,
    safeArray(tmdbNovelty.weeklyTrending),
    "tmdb_weekly_trending",
    20,
  );
  addCandidates(candidateMap, tmdbContext.watchlist, "watchlist", 18);
  addCandidates(candidateMap, baseRecommended, "trakt_recommended", 22);
  addCandidates(candidateMap, trending, "trakt_trending", 18);
  addCandidates(candidateMap, anticipated, "trakt_anticipated", 18);
  addCandidates(candidateMap, popular, "trakt_popular", 10);
  addCandidates(candidateMap, tmdbFallback, "tmdb_fallback", 6);

  const ranked = scoreCandidates({
    candidates: [...candidateMap.values()],
    message,
    profileGenres,
    watchedSet,
  });

  const contextSummary = {
    tmdbConnected: tmdbContext.connected,
    traktConnected: traktContext.connected,
    historyCount: traktContext.history.length,
    favoritesCount: tmdbContext.favorites.length,
    watchlistCount: tmdbContext.watchlist.length,
    ratedCount: tmdbContext.rated.length + traktContext.ratings.length,
    aiEnabled: !!(OLLAMA_BASE_URL || GEMINI_API_KEY || OPENAI_API_KEY),
    aiProviders: {
      ollama: !!OLLAMA_BASE_URL,
      ollamaModel: OLLAMA_BASE_URL ? OLLAMA_MODEL : null,
      gemini: !!GEMINI_API_KEY,
      openai: !!OPENAI_API_KEY,
    },
  };

  const ai = await getAiRecommendation({
    message,
    candidates: ranked,
    contextSummary,
  }).catch(() => null);

  const selected = ai?.recommendations?.length ? ai.recommendations : ranked.slice(0, 6);
  const payload = {
    reply:
      ai?.reply ||
      buildFallbackReply({ message, ranked: selected, contextSummary }),
    recommendations: selected.map((item) =>
      serializeRecommendation(item, message, ai ? "ai" : "ranking"),
    ),
    contextSummary,
    mode: ai ? "ai" : "ranking",
    provider: ai?.provider || "ranking",
  };

  const res = NextResponse.json(payload);
  if (traktContext.refreshedTokens) {
    setTraktCookies(res, traktContext.refreshedTokens);
  }
  if (traktContext.shouldClear) {
    clearTraktCookies(res);
  }
  return res;
}
