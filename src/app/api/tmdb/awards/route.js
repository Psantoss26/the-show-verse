import { json } from "@/app/api/tmdb/utils";
import {
  AWARDS_NEGATIVE_TTL_MS,
  AWARDS_REQUEST_TIMEOUT_MS,
  awardsRetryDelayMs,
  emptyAwardsResponse,
  isTransientAwardsError,
  isTransientAwardsStatus,
} from "./awardsHttp";
import { parseAwardsHtml } from "./awardsParse";

const TMDB_WEB_BASE = "https://www.themoviedb.org";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const STALE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 2;

const g = globalThis;
g.__tmdbAwardsCache = g.__tmdbAwardsCache || new Map();
g.__tmdbAwardsInflight = g.__tmdbAwardsInflight || new Map();

const cache = g.__tmdbAwardsCache;
const inflight = g.__tmdbAwardsInflight;

async function fetchAwards(type, id) {
  const cacheKey = `v5:${type}:${id}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && now - cached.t < CACHE_TTL_MS) return cached.data;
  if (inflight.has(cacheKey)) return inflight.get(cacheKey);

  const promise = (async () => {
    const url = `${TMDB_WEB_BASE}/${type}/${encodeURIComponent(
      id,
    )}/awards?language=en-US`;
    let lastError = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        const res = await fetch(url, {
          cache: "no-store",
          signal: AbortSignal.timeout(AWARDS_REQUEST_TIMEOUT_MS),
          headers: {
            accept: "text/html,application/xhtml+xml",
            "user-agent": "TheShowVerse/1.0 (+https://www.themoviedb.org)",
          },
        });

        if (res.status === 404) {
          const empty = emptyAwardsResponse({ sourceUrl: url, type, id });
          cache.set(cacheKey, { t: now, data: empty });
          return empty;
        }

        if (!res.ok) {
          const error = Object.assign(
            new Error(`TMDb awards page failed with ${res.status}`),
            { status: res.status },
          );
          if (
            isTransientAwardsStatus(res.status) &&
            attempt < MAX_ATTEMPTS - 1
          ) {
            lastError = error;
            await new Promise((resolve) =>
              setTimeout(resolve, awardsRetryDelayMs(attempt)),
            );
            continue;
          }
          throw error;
        }

        const html = await res.text();
        const { parseFailed, ...parsed } = parseAwardsHtml(html);
        if (parseFailed) {
          // No se reintenta: el mismo HTML volvería a fallar. Cae a la copia
          // antigua o a una respuesta vacía de vida corta, nunca 12 h.
          console.error(
            "[TMDb awards] markup not recognised: update awardsParse.js",
            { type, id },
          );
          lastError = new Error("TMDb awards markup not recognised");
          break;
        }
        const data = {
          source: "tmdb",
          sourceUrl: url,
          type,
          id: String(id),
          ...parsed,
        };
        cache.set(cacheKey, { t: now, data });
        return data;
      } catch (error) {
        lastError = error;
        if (
          isTransientAwardsError(error) &&
          attempt < MAX_ATTEMPTS - 1
        ) {
          await new Promise((resolve) =>
            setTimeout(resolve, awardsRetryDelayMs(attempt)),
          );
          continue;
        }
        break;
      }
    }

    if (cached && now - cached.t < STALE_CACHE_TTL_MS) {
      console.warn("[TMDb awards] serving stale cache", {
        type,
        id,
        error: lastError?.message,
      });
      return cached.data;
    }

    console.warn("[TMDb awards] unavailable", {
      type,
      id,
      error: lastError?.message,
      status: lastError?.status,
    });

    const empty = emptyAwardsResponse({
      sourceUrl: url,
      type,
      id,
      unavailable: true,
    });
    cache.set(cacheKey, {
      t: now - CACHE_TTL_MS + AWARDS_NEGATIVE_TTL_MS,
      data: empty,
    });
    return empty;
  })().finally(() => {
    inflight.delete(cacheKey);
  });

  inflight.set(cacheKey, promise);
  return promise;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") === "tv" ? "tv" : "movie";
    const id = searchParams.get("id");

    if (!id || !/^\d+$/.test(id)) {
      return json({ error: "Missing or invalid TMDb id" }, 400);
    }

    const data = await fetchAwards(type, id);
    return json(data);
  } catch (e) {
    console.error("[TMDb awards] failed", e);
    return json(
      {
        source: "tmdb",
        wins: 0,
        nominations: 0,
        total: 0,
        summary: null,
        groups: [],
        hasAwards: false,
        error: "TMDb awards unavailable",
      },
      502,
    );
  }
}
