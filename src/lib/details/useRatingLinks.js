"use client";

import { useEffect, useState } from "react";

const EMPTY = { rt: null, mc: null, lb: null };
const cache = new Map();
const pending = new Map();

// `path`: /api/links/ratings (URL de las fichas) o
// /api/links/ratings/scores (nota y votos del público leídos de esas fichas).
// Misma forma { rt, mc, lb } (lb = Letterboxd, solo películas).
function load(path, key) {
  const cacheKey = `${path}?${key}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.links);
  if (pending.has(cacheKey)) return pending.get(cacheKey);
  const request = fetch(cacheKey, { signal: AbortSignal.timeout(20_000) })
    .then(async (response) => {
      if (!response.ok) throw new Error("Rating links unavailable");
      const links = await response.json();
      if (cache.size >= 400) cache.delete(cache.keys().next().value);
      cache.set(cacheKey, { links, expires: Date.now() + (links.rt || links.mc || links.lb ? 3600000 : 300000) });
      return links;
    })
    .finally(() => pending.delete(cacheKey));
  pending.set(cacheKey, request);
  return request;
}

function useRatingSource(path, { type, tmdbId, enabled = true }) {
  const key = enabled && (type === "movie" || type === "tv") && tmdbId
    ? new URLSearchParams({ type, tmdbId: String(tmdbId) }).toString()
    : null;
  const [resolved, setResolved] = useState(null);
  useEffect(() => {
    if (!key) return;
    let active = true;
    load(path, key).then(
      (links) => { if (active) setResolved({ key, links: { ...links, ready: true } }); },
      () => { if (active) setResolved({ key, links: { ...EMPTY, ready: true } }); },
    );
    return () => { active = false; };
  }, [path, key]);
  // Never show the previous title's links while the next request is pending.
  return key && resolved?.key === key ? resolved.links : EMPTY;
}

export default function useRatingLinks(options) {
  return useRatingSource("/api/links/ratings", options);
}

// { rt, mc, lb, ready }: rt y mc { audienceScore, audienceCount,
// audienceCountBanded } | null (ver lib/details/ratingScores.js); lb
// { audienceScore (0–5), audienceCount, url, source } | null (ver
// lib/details/letterboxdScore.js). `ready` dice
// si ya se sabe la respuesta, para reservar el hueco de la insignia mientras no.
export function useRatingScores(options) {
  return useRatingSource("/api/links/ratings/scores", options);
}
