// src/lib/details/ratingScoresLoader.js
//
// Nota del público de UNA fuente (rt | mc | lb) por identidad TMDb. Solo
// servidor: la usa /api/links/ratings/scores. Cada fuente se pide y se guarda
// por separado para que el cliente reciba cada insignia en cuanto su ficha
// responde: antes las tres iban en una sola respuesta y Rotten Tomatoes y
// Letterboxd esperaban a Metacritic, la más lenta (~0,6 s más en frío, su
// página pesa ~630 KB).
//
// Las URL salen SIEMPRE de Wikidata por identidad TMDb (getRatingLinks),
// nunca del cliente: la ruta solo puede pedir fichas de esos sitios.
// Letterboxd con credenciales de API no espera a Wikidata: recibe el enlace
// como promesa y solo lo usa si tiene que caer a la ficha web.

import { getRatingLinks } from "./ratingLinksCache.js";
import { parseMetacriticScores, parseRottenTomatoesScores } from "./ratingScores.js";
import { fetchLetterboxdScore } from "./letterboxdScore.js";

export const RATING_SCORE_SOURCES = ["rt", "mc", "lb"];

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const EMPTY_TTL_MS = 60 * 60 * 1000;
const PAGE_TIMEOUT_MS = 8_000;
const MAX_ENTRIES = 3000;

const g = globalThis;
g.__ratingScoreCache = g.__ratingScoreCache || new Map();
g.__ratingScoreInflight = g.__ratingScoreInflight || new Map();
const cache = g.__ratingScoreCache;
const inflight = g.__ratingScoreInflight;

export function clearRatingScoreCache() {
  cache.clear();
  inflight.clear();
}

export function isRatingScoreSource(type, source) {
  return source === "rt" || source === "mc" || (source === "lb" && type === "movie");
}

async function readPage(url, parse, fetchImpl) {
  if (!url) return null;
  try {
    const response = await fetchImpl(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "TheShowVerse/1.0 (https://theshowverse.com)",
      },
    });
    if (!response.ok) return null;
    return parse(await response.text());
  } catch {
    return null;
  }
}

const defaults = {
  getLinks: getRatingLinks,
  fetchImpl: (...args) => fetch(...args),
  fetchLetterboxd: fetchLetterboxdScore,
};

async function fetchSource({ type, tmdbId, source }, deps) {
  const links = deps.getLinks({ type, tmdbId });
  if (source === "lb") {
    return deps.fetchLetterboxd({ tmdbId, webUrl: links.then((value) => value.lb) });
  }
  const { rt, mc } = await links;
  return source === "rt"
    ? readPage(rt, parseRottenTomatoesScores, deps.fetchImpl)
    : readPage(mc, parseMetacriticScores, deps.fetchImpl);
}

// → nota de la fuente | null. Rechaza si Wikidata falla (reintentable: no se
// guarda en caché); una ficha caída o ilegible es null y sí se guarda (1 h).
export function loadRatingScore({ type, tmdbId, source }, overrides = {}) {
  if (!isRatingScoreSource(type, source)) return Promise.resolve(null);
  const deps = { ...defaults, ...overrides };
  const key = `v3:${type}:${tmdbId}:${source}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.data);
  if (inflight.has(key)) return inflight.get(key);
  const promise = fetchSource({ type, tmdbId, source }, deps)
    .then((data) => {
      if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value);
      cache.set(key, { data, expires: Date.now() + (data ? CACHE_TTL_MS : EMPTY_TTL_MS) });
      return data;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}
