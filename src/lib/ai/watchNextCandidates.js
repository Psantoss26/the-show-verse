// src/lib/ai/watchNextCandidates.js
//
// De los criterios del intérprete (watchNextIntent.js) a candidatos correctos:
//
//   buildDiscoverQueries  → consultas de /discover de TMDb que ya cumplen los
//                           criterios (plataformas en ES, minutos, nota con
//                           votos suficientes, fechas, idioma, géneros…).
//   checkCandidate        → si un candidato cumple, con 3 niveles de exigencia
//                           para relajar lo menos importante cuando no hay
//                           bastantes.
//   scoreCandidate        → orden: encaje con lo pedido, calidad ponderada por
//                           votos, perfil del usuario, pendientes y novedad.
//
// Puro (sin red): lo usa /api/ai/watch-next y lo prueba
// watchNextCandidates.test.mjs.

import {
  GENRES,
  KEYWORDS,
  genreIdsFor,
  moodAvoidKeys,
  moodGenreKeys,
  tvKeywordIdsFor,
} from "./watchNextIntent.js";

// Las series no tienen terror, romance ni música como género en TMDb. Para
// COMPROBAR un candidato que no salió de una búsqueda por palabra clave se usa
// el género más cercano.
const TV_APPROX = {
  horror: [9648, 10765],
  romance: [18, 35],
  music: [18, 99],
  history: [10768, 18],
};

export function genreIdsForCheck(keys, mediaType) {
  const ids = new Set(genreIdsFor(keys, mediaType));
  if (mediaType === "tv") {
    for (const key of keys || []) {
      if (!(GENRES[key]?.tv || []).length) for (const id of TV_APPROX[key] || []) ids.add(id);
    }
  }
  return [...ids];
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

// Minutos que se comprueban: en series, los del episodio.
export function runtimeRange(intent, mediaType) {
  const rt = intent?.runtime || {};
  if (mediaType === "tv") {
    if (rt.episodes) return { min: rt.episodes.min ?? null, max: rt.episodes.max ?? null };
    // «serie de menos de 30 minutos»: los minutos son del episodio. «serie
    // corta» (sin número) NO limita el episodio: se favorecen miniseries.
    if (intent.mediaType === "tv" && !rt.short && !rt.long && (rt.min != null || rt.max != null)) {
      return { min: rt.min ?? null, max: rt.max ?? null };
    }
    return { min: null, max: null };
  }
  return { min: rt.min ?? null, max: rt.max ?? null };
}

function mediaTypesFor(intent) {
  if (intent.mediaType) return [intent.mediaType];
  if (intent.inCinemas) return ["movie"];
  return ["movie", "tv"];
}

/**
 * Consultas de /discover de TMDb que cumplen los criterios. Cada una lleva en
 * `verifies` lo que garantiza para sus resultados (así no hace falta pedir la
 * ficha de cada uno para comprobar duración o plataforma).
 */
export function buildDiscoverQueries(intent, { today = new Date(), region = "ES" } = {}) {
  const queries = [];
  const todayIso = isoDay(today);
  const hardKeys = intent.genres || [];
  const moodKeys = hardKeys.length ? [] : moodGenreKeys(intent);
  const keywordIds = (intent.keywords || []).map((k) => KEYWORDS[k]?.id).filter(Boolean);

  for (const mediaType of mediaTypesFor(intent)) {
    const genreIds = genreIdsFor(hardKeys, mediaType);
    const tvKeywords = mediaType === "tv" ? tvKeywordIdsFor(hardKeys.filter((k) => !(GENRES[k]?.tv || []).length)) : [];
    // Pidió géneros que este tipo no tiene (música en series) y no eligió tipo:
    // ese tipo no aporta nada correcto.
    if (hardKeys.length && !genreIds.length && !tvKeywords.length && !intent.mediaType) continue;

    const params = {};
    const verifies = new Set();
    if (genreIds.length) {
      verifies.add("genres");
    } else if (tvKeywords.length) {
      verifies.add("genres");
    }
    const without = genreIdsFor(intent.excludeGenres || [], mediaType);
    if (without.length) {
      params.without_genres = without.join(",");
      verifies.add("excludeGenres");
    }
    const keywords = [...keywordIds, ...tvKeywords];
    if (keywords.length) {
      params.with_keywords = keywords.join("|");
      if (keywordIds.length) verifies.add("keywords");
    }

    const range = runtimeRange(intent, mediaType);
    if (range.min != null) params["with_runtime.gte"] = range.min;
    if (range.max != null) params["with_runtime.lte"] = range.max;
    if (range.min != null || range.max != null) verifies.add("runtime");

    const rating = intent.rating;
    const baseVotes = mediaType === "tv" ? 40 : 80;
    if (rating?.min != null) {
      params["vote_average.gte"] = rating.min;
      verifies.add("rating");
    }
    params["vote_count.gte"] = rating?.minVotes ?? (rating ? baseVotes * 2 : baseVotes);

    if (intent.providers?.length || intent.free) {
      params.watch_region = region;
      params.with_watch_monetization_types = intent.free ? "free|ads" : "flatrate|free|ads";
      if (intent.providers?.length) {
        params.with_watch_providers = [...new Set(intent.providers.flatMap((p) => p.ids))].join("|");
      }
      verifies.add("providers");
    }

    const dateGte = mediaType === "movie" ? "primary_release_date.gte" : "first_air_date.gte";
    const dateLte = mediaType === "movie" ? "primary_release_date.lte" : "first_air_date.lte";
    if (intent.future) {
      params[dateGte] = todayIso;
      params["vote_count.gte"] = 0;
      verifies.add("future");
    } else {
      if (intent.years?.from) params[dateGte] = intent.years.from;
      // Nunca lo que aún no se ha estrenado, salvo que lo pida.
      params[dateLte] = intent.years?.to && intent.years.to < todayIso ? intent.years.to : todayIso;
      if (intent.years) verifies.add("years");
      if (intent.years?.recent) params["vote_count.gte"] = Math.min(params["vote_count.gte"], mediaType === "tv" ? 15 : 30);
    }

    if (intent.origin?.language) {
      params.with_original_language = intent.origin.language;
      verifies.add("origin");
    }
    if (intent.origin?.country) params.with_origin_country = intent.origin.country;
    if (mediaType === "movie") params.region = region;

    const path = `/discover/${mediaType}`;
    const verified = [...verifies];

    // Géneros: TODOS a la vez («comedia romántica») y, si son varios,
    // CUALQUIERA. Con ánimo y sin géneros, cualquiera de los del ánimo.
    const genreVariants = [];
    if (genreIds.length > 1) {
      genreVariants.push({ with_genres: genreIds.join(","), tag: "all" });
      genreVariants.push({ with_genres: genreIds.join("|"), tag: "any" });
    } else if (genreIds.length === 1) {
      genreVariants.push({ with_genres: String(genreIds[0]), tag: "all" });
    } else if (moodKeys.length) {
      const moodIds = genreIdsFor(moodKeys, mediaType);
      genreVariants.push(moodIds.length ? { with_genres: moodIds.join("|"), tag: "mood" } : { tag: "none" });
    } else {
      genreVariants.push({ tag: "none" });
    }

    genreVariants.forEach((variant, variantIndex) => {
      const base = { ...params };
      if (variant.with_genres) base.with_genres = variant.with_genres;
      const meta = { mediaType, path, verifies: verified, genreMatch: variant.tag };
      queries.push({ ...meta, params: { ...base, sort_by: "popularity.desc", page: 1 } });
      if (variant.tag !== "any") {
        queries.push({ ...meta, params: { ...base, sort_by: "popularity.desc", page: 2 } });
      }
      // Mejor valoradas (con votos de sobra para que la nota sea fiable): para
      // «buena nota», clásicos o cuando no hay nada que ordene por novedad.
      if (!intent.future && !intent.years?.recent && variant.tag !== "any") {
        queries.push({
          ...meta,
          params: {
            ...base,
            sort_by: "vote_average.desc",
            "vote_count.gte": Math.max(base["vote_count.gte"] || 0, mediaType === "tv" ? 150 : 400),
            page: 1,
          },
        });
      }
      // «Serie corta» sin minutos: una búsqueda de miniseries (palabra clave de
      // TMDb) para que suban, sin limitar la duración del episodio.
      if (mediaType === "tv" && intent.runtime?.short && variantIndex === 0 && !(intent.keywords || []).includes("miniseries")) {
        queries.push({
          ...meta,
          verifies: [...verified, "miniseries"],
          params: {
            ...base,
            with_keywords: [base.with_keywords, KEYWORDS.miniseries.id].filter(Boolean).join("|"),
            sort_by: "popularity.desc",
            page: 1,
          },
        });
      }
    });
  }

  // Cartelera: estrenos en cines de España de las últimas semanas.
  if (intent.inCinemas) {
    const from = new Date(today.getTime() - 50 * 86400000);
    const params = {
      region,
      with_release_type: "3|2",
      "release_date.gte": isoDay(from),
      "release_date.lte": todayIso,
      sort_by: "popularity.desc",
      page: 1,
    };
    const genreIds = genreIdsFor(intent.genres, "movie");
    if (genreIds.length) params.with_genres = genreIds.join("|");
    const without = genreIdsFor(intent.excludeGenres, "movie");
    if (without.length) params.without_genres = without.join(",");
    queries.push({ mediaType: "movie", path: "/discover/movie", params, verifies: ["cinema", ...(genreIds.length ? ["genres"] : [])], genreMatch: "cinema" });
  }

  return queries;
}

// ---------------------------------------------------------------------------

function itemGenreSet(item) {
  return new Set((item?.genreIds || []).map(Number));
}

function inRange(value, { min, max }) {
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return true;
}

/**
 * ¿Cumple el candidato los criterios? `level`:
 *   0 → todos;
 *   1 → sin nota mínima ni época, y la duración con 15 min de margen;
 *   2 → además sin géneros pedidos (se mantienen tipo, excluidos,
 *       plataforma, cines y «de mis pendientes»).
 * Devuelve { ok, missing: [criterio, …] }.
 *
 * Duración y plataforma no vienen en los listados de TMDb: valen si el
 * candidato salió de una búsqueda que ya las garantiza (`item.verified`) o si
 * se pidió su ficha (`item.runtime`, `item.episodeRuntime`, `item.providerIds`).
 */
export function checkCandidate(item, intent, { today = new Date(), level = 0 } = {}) {
  const missing = [];
  const verified = new Set(item?.verified || []);
  const todayIso = isoDay(today);
  const genres = itemGenreSet(item);
  const type = item?.mediaType;

  if (intent.mediaType && type !== intent.mediaType) missing.push("type");
  if (intent.inCinemas && type !== "movie") missing.push("type");

  // Excluir solo por géneros REALES: con los aproximados, «sin romance» en
  // series quitaría todos los dramas y comedias.
  const excluded = genreIdsFor(intent.excludeGenres, type);
  if (excluded.some((id) => genres.has(id))) missing.push("excludeGenres");

  if (intent.onlyWatchlist && !(item?.sources || []).includes("watchlist")) missing.push("watchlist");

  // Sin estrenar: fuera, salvo que pida próximos estrenos.
  const release = item?.releaseDate || null;
  if (intent.future) {
    if (release && release < todayIso) missing.push("future");
  } else if (release && release > todayIso) {
    missing.push("unreleased");
  }

  if (intent.inCinemas && !verified.has("cinema") && !(item?.sources || []).includes("tmdb_now_playing")) {
    missing.push("cinema");
  }

  if (intent.providers?.length || intent.free) {
    const wanted = new Set((intent.providers || []).flatMap((p) => p.ids));
    const ok = verified.has("providers") ||
      (Array.isArray(item?.providerIds) &&
        (intent.providers?.length ? item.providerIds.some((id) => wanted.has(id)) : item.providerIds.length > 0));
    if (!ok) missing.push("providers");
  }

  if (intent.origin?.language) {
    const langs = intent.origin.language.split("|");
    const lang = item?.originalLanguage || null;
    if (!verified.has("origin") && (!lang || !langs.includes(lang))) missing.push("origin");
    if (intent.origin.country && Array.isArray(item?.originCountry) && item.originCountry.length && !item.originCountry.includes(intent.origin.country)) {
      missing.push("origin");
    }
  }

  // --- Relajables ---
  if (level < 2 && intent.genres?.length) {
    const ids = genreIdsForCheck(intent.genres, type);
    if (!verified.has("genres") && ids.length && !ids.some((id) => genres.has(id))) missing.push("genres");
  }

  // «Parecida a X» con similares de sobra (lo decide la ruta): solo esos.
  if (level < 2 && intent.requireSimilar && !(item?.sources || []).some((s) => s === "similar" || s === "similar_favorites")) {
    missing.push("similar");
  }

  if (level < 2 && intent.keywords?.length && !verified.has("keywords")) {
    // Sin palabras clave en los listados: solo valen los que salieron de la
    // búsqueda con ellas (o los que el modelo eligió de una lista que ya las
    // cumplía). Relajable.
    if (level === 0) missing.push("keywords");
  }

  const range = runtimeRange(intent, type);
  if (range.min != null || range.max != null) {
    const margin = level >= 1 ? 15 : 0;
    const minutes = type === "tv" ? item?.episodeRuntime : item?.runtime;
    const widened = { min: range.min != null ? range.min - margin : null, max: range.max != null ? range.max + margin : null };
    const ok = verified.has("runtime") || (Number.isFinite(minutes) && minutes > 0 && inRange(minutes, widened));
    if (!ok) missing.push("runtime");
  }

  if (level < 1 && intent.rating?.min != null) {
    const vote = Number(item?.voteAverage);
    const votes = Number(item?.voteCount);
    const minVotes = intent.rating.minVotes ?? (type === "tv" ? 40 : 80);
    const enoughVotes = !Number.isFinite(votes) || votes >= minVotes || verified.has("rating");
    if (!(Number.isFinite(vote) && vote >= intent.rating.min && enoughVotes)) missing.push("rating");
  }

  if (level < 1 && intent.years && !intent.future) {
    if (!release) missing.push("years");
    else {
      if (intent.years.from && release < intent.years.from) missing.push("years");
      if (intent.years.to && release > `${intent.years.to}`) missing.push("years");
    }
  }

  return { ok: missing.length === 0, missing: [...new Set(missing)] };
}

// Lo que se deja de exigir en cada nivel (para contarlo en la respuesta).
export const RELAXED_AT_LEVEL = {
  1: ["rating", "years", "runtime"],
  2: ["genres", "keywords", "similar"],
};

// ---------------------------------------------------------------------------

// Nota ponderada por votos (media bayesiana): un 9 con 12 votos no gana a un
// 8,2 con 20.000.
export function weightedRating(item, { prior = 6.6, weight = 250 } = {}) {
  const vote = Number(item?.voteAverage);
  const votes = Number(item?.voteCount);
  if (!Number.isFinite(vote) || vote <= 0) return prior - 0.6;
  if (!Number.isFinite(votes) || votes <= 0) return (vote + prior) / 2;
  return (vote * votes + prior * weight) / (votes + weight);
}

const NOVELTY_BONUS = {
  tmdb_now_playing: 22,
  tmdb_upcoming: 10,
  tmdb_on_the_air: 18,
  tmdb_airing_today: 14,
  tmdb_weekly_trending: 18,
  trakt_trending: 16,
  trakt_anticipated: 10,
  trakt_popular: 6,
  tmdb_fallback: 3,
};

/**
 * Puntuación de un candidato que ya pasó el filtro. `ctx`:
 *   profileGenres (ids), watchedSet, recentKeySet, quickPick, today.
 */
export function scoreCandidate(item, intent, ctx = {}) {
  const key = `${item.mediaType}:${Number(item.id)}`;
  const sources = new Set(item.sources || []);
  const genres = itemGenreSet(item);
  const type = item.mediaType;
  let score = 0;

  // Calidad (0-~60) y popularidad (0-16).
  score += (weightedRating(item) - 5) * 12;
  if (item.popularity) score += Math.min(16, Math.log10(item.popularity + 1) * 6);
  if (intent.rating) score += (weightedRating(item) - 6) * 8;

  // Encaje con lo pedido.
  const hardIds = genreIdsForCheck(intent.genres, type);
  const hardHits = hardIds.filter((id) => genres.has(id)).length;
  score += hardHits * 16;
  if ((item.verified || []).includes("genres")) score += 12;
  if (item.genreMatch === "all") score += 14;

  const moodIds = genreIdsForCheck(moodGenreKeys(intent), type);
  score += moodIds.filter((id) => genres.has(id)).length * 9;
  const avoidIds = genreIdsFor(moodAvoidKeys(intent), type);
  score -= avoidIds.filter((id) => genres.has(id)).length * 14;

  if ((item.verified || []).includes("keywords")) score += 10;
  if (sources.has("similar")) score += 34;
  if (sources.has("similar_favorites")) score += 22;

  // Duración: cuanto más cerca del centro del rango, mejor (si se conoce).
  const range = runtimeRange(intent, type);
  const minutes = type === "tv" ? item.episodeRuntime : item.runtime;
  if (Number.isFinite(minutes) && (range.min != null || range.max != null)) {
    const target = range.min != null && range.max != null ? (range.min + range.max) / 2 : range.max ?? range.min;
    score -= Math.min(12, Math.abs(minutes - target) / 6);
  }
  // «Serie corta» sin minutos: miniseries arriba.
  if (type === "tv" && intent.runtime?.short && (item.verified || []).includes("miniseries")) score += 12;

  // Perfil del usuario.
  let profileHits = 0;
  for (const id of ctx.profileGenres || []) if (genres.has(id)) profileHits += 1;
  score += Math.min(12, profileHits * 4);

  // Pendientes: el usuario ya mostró interés. Cuenta más cuando además cumple
  // lo que pide (ya filtrado) que en una petición genérica.
  // Con «parecida a…», estar en Pendientes solo suma de verdad si además se
  // parece.
  const isSimilar = sources.has("similar") || sources.has("similar_favorites");
  if (sources.has("watchlist")) {
    score += intent.similar && !isSimilar ? 6 : intent.hasIntent ? 26 : ctx.quickPick ? 12 : 18;
  }
  if (sources.has("trakt_recommended")) score += 10;

  // Novedad: solo cuenta sin criterios o cuando se piden estrenos/cines.
  const wantsNovelty = !intent.hasConstraints || intent.years?.recent || intent.inCinemas;
  if (wantsNovelty) {
    let novelty = 0;
    for (const source of sources) novelty = Math.max(novelty, NOVELTY_BONUS[source] || 0);
    score += novelty;
  }

  // Ya recomendado hace poco / ya visto.
  if (ctx.recentKeySet?.has(key)) score -= ctx.quickPick ? 110 : 80;
  if (ctx.watchedSet?.has(key)) score += intent.rewatch ? 15 : sources.has("watchlist") ? -70 : -140;

  return score;
}
