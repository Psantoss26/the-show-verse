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
  process.env.OPENAI_WATCH_NEXT_MODEL || process.env.OPENAI_MODEL || "gpt-5.4-mini";
const OPENAI_WATCH_NEXT_REASONING_EFFORT =
  process.env.OPENAI_WATCH_NEXT_REASONING_EFFORT || "low";

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
  const [movies, shows, trending] = await Promise.all([
    tmdbList("/movie/popular", { page: 1 }).catch(() => []),
    tmdbList("/tv/popular", { page: 1 }).catch(() => []),
    tmdbList("/trending/all/week", { page: 1 }).catch(() => []),
  ]);

  return [...movies, ...shows, ...trending]
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

      if (item.sources.includes("watchlist")) score += 48;
      if (item.sources.includes("trakt_recommended")) score += 28;
      if (item.sources.includes("trakt_trending")) score += 12;
      if (item.sources.includes("trakt_popular")) score += 8;
      if (item.sources.includes("tmdb_fallback")) score += 6;
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
  if (item.sources.includes("watchlist")) {
    bits.push("ya la tienes pendiente, así que es una opción directa para ver ahora");
  }
  if (item.sources.includes("trakt_recommended")) {
    bits.push("también aparece entre recomendaciones de Trakt");
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
    matchTags: item.matchTags || item.sources.map((s) => {
      if (s === "watchlist") return "Pendiente";
      if (s === "trakt_recommended") return "Trakt";
      if (s === "trakt_trending") return "Tendencia";
      if (s === "trakt_popular") return "Popular";
      if (s === "tmdb_fallback") return "TMDb";
      return s;
    }).slice(0, 3),
  };
}

function buildFallbackReply({ message, ranked, contextSummary }) {
  const hasPersonal =
    contextSummary.watchlistCount ||
    contextSummary.favoritesCount ||
    contextSummary.historyCount ||
    contextSummary.ratedCount;
  const intro = hasPersonal
    ? "He cruzado lo que te apetece con tus pendientes, favoritos, valoraciones e historial."
    : "No tengo mucho contexto personal todavía, así que he priorizado opciones fuertes y populares.";
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

  const compactCandidates = candidates.slice(0, 28).map((item) => ({
    key: itemKey(item),
    id: item.id,
    mediaType: item.mediaType,
    title: item.title,
    year: item.year,
    voteAverage: item.voteAverage,
    sources: item.sources,
    overview: item.overview ? item.overview.slice(0, 280) : "",
    score: Math.round(item.score),
  }));

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
          content:
            "Eres un recomendador experto de cine y series para The Show Verse. Elige solo elementos de la lista de candidatos. Responde exclusivamente JSON válido con: {\"reply\": string, \"recommendations\": [{\"key\": string, \"reason\": string, \"matchTags\": string[]}]} . Razona con criterios sólidos: gustos previos, pendientes, historial, estado de ánimo y calidad. Todo en español.",
        },
        {
          role: "user",
          content: JSON.stringify({
            mood: message,
            contextSummary,
            candidates: compactCandidates,
          }),
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
  if (!parsed?.recommendations?.length) return null;

  const byKey = new Map(candidates.map((item) => [itemKey(item), item]));
  const selected = parsed.recommendations
    .map((rec) => {
      const item = byKey.get(rec?.key);
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
        : buildFallbackReply({ message, ranked: selected, contextSummary }),
    recommendations: selected,
  };
}

export async function POST(request) {
  const cookieStore = await cookies();
  const body = await request.json().catch(() => ({}));
  const message = String(body?.message || "").trim().slice(0, 800);

  const [tmdbContext, traktContext, baseRecommended, trending, popular, tmdbFallback] =
    await Promise.all([
      getTmdbContext(cookieStore),
      getTraktContext(cookieStore),
      getTraktRecommended(30).catch(() => []),
      getTraktTrending(24).catch(() => []),
      getTraktPopular(24).catch(() => []),
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
  addCandidates(candidateMap, tmdbContext.watchlist, "watchlist", 45);
  addCandidates(candidateMap, baseRecommended, "trakt_recommended", 28);
  addCandidates(candidateMap, trending, "trakt_trending", 16);
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
    aiEnabled: !!OPENAI_API_KEY,
  };

  const ai = await getOpenAiRecommendation({
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
