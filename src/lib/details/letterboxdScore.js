// src/lib/details/letterboxdScore.js
//
// Nota media de Letterboxd (0,5–5, ponderada) y su número de valoraciones para
// una PELÍCULA (Letterboxd no tiene series). Solo servidor: la usa
// /api/links/ratings/scores junto a Rotten Tomatoes y Metacritic.
//
// Dos vías, elegidas por las variables de entorno:
//   1. API oficial (https://api-docs.letterboxd.com), si hay
//      LETTERBOXD_CLIENT_ID y LETTERBOXD_CLIENT_SECRET. El acceso es por
//      solicitud a Letterboxd. Flujo OAuth2 Client Credentials (solo datos
//      públicos): token en /auth/token, película en /film/tmdb:{id} (`rating`,
//      `link`, `id`) y recuento en /film/{id}/statistics (`counts.ratings`).
//      Un 404 es «no está en Letterboxd». Cualquier otro fallo (token rechazado,
//      5xx, red) cae a la vía web para no perder la nota.
//   2. Web pública: la ficha /film/<slug>/ (o /imdb/<tt>/, que redirige a ella)
//      que da Wikidata por identidad TMDb (resolveRatingLinks). Se lee el
//      JSON-LD `aggregateRating` (ratingValue, ratingCount). Nunca se usa
//      /tmdb/<id>/: Letterboxd mezcla ahí ids de series con películas (Breaking
//      Bad acababa en «Mirror», 1975). Si la redirección no termina en una ficha
//      /film/ («IMDb ID Not found»), no hay nota. Cloudflare puede bloquearla:
//      entonces simplemente no hay insignia.
// Sin dato reconocible devuelve null y la insignia no se pinta.

import { formatCountShort } from "./formatters.js";

const API_BASE = "https://api.letterboxd.com/api/v0";
const TIMEOUT_MS = 8_000;
const USER_AGENT = "TheShowVerse/1.0 (https://theshowverse.com)";
const FILM_URL = /^https:\/\/letterboxd\.com\/film\/[a-z0-9][a-z0-9-]*\/$/;
const WEB_URL = /^https:\/\/letterboxd\.com\/(?:film\/[a-z0-9][a-z0-9-]*|imdb\/tt\d{7,10})\/$/;

const g = globalThis;
g.__letterboxdToken = g.__letterboxdToken || { value: null, expires: 0, pending: null };
const token = g.__letterboxdToken;

export function resetLetterboxdTokenCache() {
  token.value = null;
  token.expires = 0;
  token.pending = null;
}

export function hasLetterboxdApiCredentials(env = process.env) {
  return Boolean(env?.LETTERBOXD_CLIENT_ID?.trim() && env?.LETTERBOXD_CLIENT_SECRET?.trim());
}

// Media 0–5 tal cual (sin redondear: la insignia decide), o null fuera de rango.
function score5(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= 5 ? n : null;
}

function positiveInt(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function filmUrl(value) {
  return typeof value === "string" && FILM_URL.test(value) ? value : null;
}

export function parseLetterboxdFilmPage(html) {
  const text = String(html || "");
  const blocks = text.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const [, raw] of blocks) {
    let data;
    try {
      // Letterboxd envuelve el JSON en /* <![CDATA[ */ … /* ]]> */.
      data = JSON.parse(raw.replace(/\/\*\s*<!\[CDATA\[\s*\*\/|\/\*\s*\]\]>\s*\*\//g, "").trim());
    } catch {
      continue;
    }
    if (data?.["@type"] !== "Movie") continue;
    const audienceScore = score5(data.aggregateRating?.ratingValue);
    if (audienceScore == null) return null;
    const ogUrl = /<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i.exec(text)?.[1];
    return {
      audienceScore,
      audienceCount: positiveInt(data.aggregateRating?.ratingCount),
      url: filmUrl(data.url) || filmUrl(ogUrl),
    };
  }
  return null;
}

export function parseLetterboxdApiScore(film, statistics) {
  const audienceScore = score5(film?.rating);
  if (audienceScore == null) return null;
  return {
    audienceScore,
    audienceCount: positiveInt(statistics?.counts?.ratings),
    url: filmUrl(film?.link),
  };
}

// Insignia del marcador: { value: "8.5", sub: "4,6M", href }. La media 0–5 se
// muestra sobre 10 (×2), como las demás puntuaciones del marcador.
export function letterboxdScoreBadge(score, href = score?.url) {
  if (score?.audienceScore == null) return null;
  return {
    value: (score.audienceScore * 2).toFixed(1),
    sub: formatCountShort(score.audienceCount) || undefined,
    href: href || undefined,
  };
}

class NotFound extends Error {}

async function getAccessToken(env, fetchImpl) {
  if (token.value && token.expires > Date.now()) return token.value;
  if (token.pending) return token.pending;
  token.pending = (async () => {
    const response = await fetchImpl(`${API_BASE}/auth/token`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: env.LETTERBOXD_CLIENT_ID.trim(),
        client_secret: env.LETTERBOXD_CLIENT_SECRET.trim(),
      }).toString(),
    });
    if (!response.ok) throw new Error(`Letterboxd token ${response.status}`);
    const data = await response.json();
    if (typeof data?.access_token !== "string" || !data.access_token) throw new Error("Letterboxd token missing");
    const ttl = Number(data.expires_in) > 0 ? Number(data.expires_in) * 1000 : 3_600_000;
    token.value = data.access_token;
    // Se renueva un minuto antes de que caduque.
    token.expires = Date.now() + Math.max(ttl - 60_000, 30_000);
    return token.value;
  })().finally(() => { token.pending = null; });
  return token.pending;
}

async function apiGet(path, accessToken, fetchImpl) {
  const response = await fetchImpl(`${API_BASE}${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "User-Agent": USER_AGENT },
  });
  if (response.status === 404) throw new NotFound();
  if (response.status === 401) resetLetterboxdTokenCache();
  if (!response.ok) throw new Error(`Letterboxd API ${response.status}`);
  return response.json();
}

async function fromApi(tmdbId, env, fetchImpl) {
  const accessToken = await getAccessToken(env, fetchImpl);
  const film = await apiGet(`/film/tmdb:${encodeURIComponent(tmdbId)}`, accessToken, fetchImpl);
  if (score5(film?.rating) == null) return null;
  // El recuento es un extra: si sus estadísticas fallan, la nota sigue valiendo.
  const statistics = typeof film?.id === "string" && /^\w+$/.test(film.id)
    ? await apiGet(`/film/${film.id}/statistics`, accessToken, fetchImpl).catch(() => null)
    : null;
  return parseLetterboxdApiScore(film, statistics);
}

async function fromWeb(webUrlOrPromise, fetchImpl) {
  const webUrl = await Promise.resolve(webUrlOrPromise).catch(() => null);
  if (typeof webUrl !== "string" || !WEB_URL.test(webUrl)) return null;
  try {
    const response = await fetchImpl(webUrl, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "text/html,application/xhtml+xml", "user-agent": USER_AGENT },
    });
    // /imdb/<tt>/ sin película responde 200 con «IMDb ID Not found»: solo vale
    // si se terminó en una ficha /film/.
    if (!response.ok || !filmUrl(response.url)) return null;
    const score = parseLetterboxdFilmPage(await response.text());
    return score ? { ...score, url: score.url || response.url } : null;
  } catch {
    return null;
  }
}

// { tmdbId, webUrl } → { audienceScore, audienceCount, url, source } | null.
// `webUrl` es el enlace de Wikidata (resolveRatingLinks().lb), o una PROMESA
// de él: con credenciales la API arranca sin esperar a Wikidata (solo la
// necesita la vía web, de reserva).
export async function fetchLetterboxdScore(
  { tmdbId, webUrl } = {},
  { env = process.env, fetchImpl = fetch } = {},
) {
  if (hasLetterboxdApiCredentials(env) && /^[1-9]\d{0,9}$/.test(String(tmdbId ?? ""))) {
    try {
      const score = await fromApi(String(tmdbId), env, fetchImpl);
      if (!score) return null;
      const fallbackUrl = score.url ? null : await Promise.resolve(webUrl).catch(() => null);
      return { ...score, url: score.url || filmUrl(fallbackUrl), source: "api" };
    } catch (error) {
      if (error instanceof NotFound) return null;
      // API caída o credenciales rechazadas: se intenta la web.
    }
  }
  const score = await fromWeb(webUrl, fetchImpl);
  return score ? { ...score, source: "web" } : null;
}
