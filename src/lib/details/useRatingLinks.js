"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { ratingScoreSourcesFor, ratingScoresUrl } from "./ratingScoresUrl";

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

// --- Notas del público (rt, mc, lb) ---------------------------------------
//
// Una petición POR FUENTE (/api/links/ratings/scores?…&source=rt), lanzadas a
// la vez: cada insignia se pinta en cuanto llega la suya. Antes era una sola
// respuesta y Rotten Tomatoes y Letterboxd esperaban a Metacritic.
//
// Las peticiones salen en el RENDER (son idempotentes: caché + en vuelo), no
// en un efecto: en la ficha móvil el efecto llega tarde tras hidratar
// DetailsClient. Si ya salieron antes (precarga del HTML, RatingScoresPreload;
// o al tocar el enlace, RatingScoresPrefetch) se reutiliza esa misma petición.
// Una nota ya leída se toma de la caché de forma síncrona: al volver a abrir
// la ficha se pinta en el primer render, sin pasar por `pending`.
const scoreCache = new Map();
const scorePending = new Map();
const scoreFailed = new Map();
const FAILED_RETRY_MS = 30_000;

function cachedScore(url) {
  const hit = scoreCache.get(url);
  return hit && hit.expires > Date.now() ? hit : null;
}

function loadScore(url, source) {
  const hit = cachedScore(url);
  if (hit) return Promise.resolve(hit.value);
  if (scorePending.has(url)) return scorePending.get(url);
  // Un fallo reciente no se repite en cada render.
  if ((scoreFailed.get(url) || 0) > Date.now()) return Promise.reject(new Error("Rating score unavailable"));
  const request = fetch(url, { signal: AbortSignal.timeout(20_000) })
    .then(async (response) => {
      if (!response.ok) throw new Error("Rating score unavailable");
      const value = (await response.json())?.[source] ?? null;
      if (scoreCache.size >= 600) scoreCache.delete(scoreCache.keys().next().value);
      scoreCache.set(url, { value, expires: Date.now() + (value ? 3_600_000 : 300_000) });
      return value;
    })
    .catch((error) => {
      scoreFailed.set(url, Date.now() + FAILED_RETRY_MS);
      throw error;
    })
    .finally(() => scorePending.delete(url));
  scorePending.set(url, request);
  return request;
}

function scoreUrls(type, tmdbId) {
  return ratingScoreSourcesFor(type).map((source) => [source, ratingScoresUrl(type, tmdbId, source)]);
}

// Adelanta la lectura de las notas de un título (al tocar su enlace). No hace
// nada si ya están en caché o en camino.
export function prefetchRatingScores({ type, tmdbId }) {
  if (typeof window === "undefined" || !tmdbId) return;
  for (const [source, url] of scoreUrls(type, tmdbId)) loadScore(url, source).catch(() => {});
}

// { rt, mc, lb, ready, settled }: rt y mc { audienceScore, audienceCount,
// audienceCountBanded } | null (ver lib/details/ratingScores.js); lb
// { audienceScore (0–5), audienceCount, url, source } | null (ver
// lib/details/letterboxdScore.js). `settled[fuente]` dice si ya se sabe la
// respuesta de esa fuente, para reservar el hueco de su insignia mientras no;
// `ready`, si se saben todas.
export function useRatingScores({ type, tmdbId, enabled = true }) {
  const id = enabled && (type === "movie" || type === "tv") && tmdbId ? `${type}:${tmdbId}` : null;
  const urls = useMemo(() => (id ? scoreUrls(type, tmdbId) : []), [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (typeof window !== "undefined") {
    for (const [source, url] of urls) loadScore(url, source).catch(() => {});
  }
  const [arrived, setArrived] = useState({});
  useEffect(() => {
    let active = true;
    for (const [source, url] of urls) {
      if (cachedScore(url)) continue;
      const settle = (value) => {
        if (!active) return;
        // Transición: cada nota que llega re-renderiza la ficha entera; así no
        // corta una animación ni un toque en curso.
        startTransition(() => setArrived((prev) => ({ ...prev, [url]: { value } })));
      };
      loadScore(url, source).then(settle, () => settle(null));
    }
    return () => { active = false; };
  }, [urls]);
  const result = { rt: null, mc: null, lb: null, ready: true, settled: { rt: true, mc: true, lb: true } };
  // Sin título aún (o desactivado): nada sabido, como antes (`ready` falso).
  if (!id) return { ...result, ready: false, settled: { rt: false, mc: false, lb: false } };
  for (const [source, url] of urls) {
    const hit = cachedScore(url) || arrived[url];
    result[source] = hit ? hit.value : null;
    result.settled[source] = Boolean(hit);
    if (!hit) result.ready = false;
  }
  return result;
}
