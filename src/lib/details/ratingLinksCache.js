// src/lib/details/ratingLinksCache.js
//
// Enlaces de Rotten Tomatoes, Metacritic y Letterboxd por identidad TMDb
// (resolveRatingLinks), con caché en memoria del proceso y una sola petición
// en vuelo por título. Solo servidor: la comparten /api/links/ratings y
// /api/links/ratings/scores, que el cliente pide a la vez para la misma ficha
// (antes cada una iba a Wikidata por su cuenta). Los enlaces casi nunca
// cambian: duran mucho más que las notas, así que al caducar una nota no se
// vuelve a consultar Wikidata.

import { resolveRatingLinks } from "./resolveRatingLinks.js";

const LINKS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMPTY_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_ENTRIES = 2000;

const g = globalThis;
g.__ratingLinksCache = g.__ratingLinksCache || new Map();
g.__ratingLinksInflight = g.__ratingLinksInflight || new Map();
const cache = g.__ratingLinksCache;
const inflight = g.__ratingLinksInflight;

export function clearRatingLinksCache() {
  cache.clear();
  inflight.clear();
}

export function getRatingLinks({ type, tmdbId }, resolve = resolveRatingLinks) {
  const key = `${type}:${tmdbId}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.links);
  if (inflight.has(key)) return inflight.get(key);
  const promise = Promise.resolve()
    .then(() => resolve({ type, tmdbId }))
    .then((links) => {
      if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value);
      const found = links.rt || links.mc || links.lb;
      cache.set(key, { links, expires: Date.now() + (found ? LINKS_TTL_MS : EMPTY_TTL_MS) });
      return links;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}
