import { NextResponse } from "next/server";
import { isRatingLinksIdentity, resolveRatingLinks } from "@/lib/details/resolveRatingLinks";
import { parseMetacriticScores, parseRottenTomatoesScores } from "@/lib/details/ratingScores";
import { fetchLetterboxdScore } from "@/lib/details/letterboxdScore";

export const runtime = "nodejs";

// Notas del público de Rotten Tomatoes (Popcornmeter) y Metacritic (User Score)
// con su recuento de votos. Las URL salen SIEMPRE de Wikidata por
// identidad TMDb (resolveRatingLinks), nunca del cliente: así la ruta solo puede
// pedir fichas de esos dos sitios.
// Letterboxd (`lb`, solo películas): media 0–5 y valoraciones, por su API
// oficial si hay credenciales o por la ficha web que da Wikidata (ver
// lib/details/letterboxdScore.js).
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const EMPTY_TTL_MS = 60 * 60 * 1000;
const PAGE_TIMEOUT_MS = 8_000;

const g = globalThis;
g.__ratingScoresCache = g.__ratingScoresCache || new Map();
g.__ratingScoresInflight = g.__ratingScoresInflight || new Map();
const cache = g.__ratingScoresCache;
const inflight = g.__ratingScoresInflight;

async function readScores(url, parse) {
  if (!url) return null;
  try {
    const response = await fetch(url, {
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

async function loadScores(type, tmdbId) {
  const key = `v2:${type}:${tmdbId}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data;
  if (inflight.has(key)) return inflight.get(key);
  const promise = (async () => {
    const links = await resolveRatingLinks({ type, tmdbId });
    const [rt, mc, lb] = await Promise.all([
      readScores(links.rt, parseRottenTomatoesScores),
      readScores(links.mc, parseMetacriticScores),
      type === "movie" ? fetchLetterboxdScore({ tmdbId, webUrl: links.lb }) : null,
    ]);
    const data = { rt, mc, lb };
    if (cache.size >= 1000) cache.delete(cache.keys().next().value);
    cache.set(key, { data, expires: Date.now() + (rt || mc || lb ? CACHE_TTL_MS : EMPTY_TTL_MS) });
    return data;
  })().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const tmdbId = searchParams.get("tmdbId");
  if (!isRatingLinksIdentity(type, tmdbId)) {
    return NextResponse.json({ error: "Invalid type or TMDb id" }, { status: 400 });
  }
  try {
    const scores = await loadScores(type, tmdbId);
    return NextResponse.json(scores, {
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=43200" },
    });
  } catch {
    return NextResponse.json(
      { rt: null, mc: null, lb: null },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
